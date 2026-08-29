import {useState, createContext, ReactNode, useRef, useEffect} from 'react';
import { DEFAULT_URL, ReplService, WebSocketClient } from '../service/websocket-client';


export type ReplStateT = 'initial' | 'network-connecting' | 'network-disconnected' | 'activated';

export type EditingCellT = {state: 'editing', code: string, compileError?: string};
export type ExecutingCellT = {state: 'compiling' | 'loading' | 'executing', code: string};
export type ExecutedCellT = {state: 'executed', id: number, code: string, time: {compilation: number, loading: number, execution: number}};

export type LogT = {message: string, type: 'output' | 'error'};

export type ReplContextT = {
    state: ReplStateT,
    latestCell: EditingCellT | ExecutingCellT,
    executedCells: ExecutedCellT[],
    logs: LogT[],
    setCode: (code: string) => void,
    executeLatestCell: () => Promise<void>,
}

export const ReplContext = createContext<ReplContextT | undefined>(undefined);

// The transport is normally a WebSocket to the CLI. A host page may provide
// another client with the same interface (e.g. an in-browser compiler with
// Web Bluetooth) before the provider mounts.
export type ReplClient = Pick<WebSocketClient, 'on' | 'off' | 'connect' | 'disconnect' | 'getService'>;
let replClientFactory: () => ReplClient = () => new WebSocketClient();
export function setReplClientFactory(factory: () => ReplClient) {
    replClientFactory = factory;
}

export default function ReplProvider({children}: {children: ReactNode}) {
    const [replState, setReplState] = useState<ReplStateT>('initial');
    const [latestCell, setLatestCell] = useState<EditingCellT | ExecutingCellT>({state: 'editing', code:''});
    const [executedCells, setExecutedCells] = useState<ExecutedCellT[]>([]);
    const [logs, setLogs] = useState<LogT[]>([]);

    const wsc = useRef<ReplClient|null>(null);
    const replService = useRef<ReplService|null>(null);

    useEffect(() => {
        const url = DEFAULT_URL;
        wsc.current = replClientFactory();
        wsc.current.on('connected', () => {
            setReplState('activated');
            replService.current = wsc.current?.getService('repl') ?? null;
            replService.current?.on('log', (message) => setLogs((logs) => [...logs, {message, type: 'output'}]));
            replService.current?.on('error', (message) => setLogs((logs) => [...logs, {message, type: 'error'}]));
        });
        wsc.current.on('disconnected', () => {
            setReplState('network-disconnected');
        });

        wsc.current.connect(url);
        
        return () => {
            wsc.current?.off('connected');
            wsc.current?.off('disconnected');
            replService.current?.off('log');
            replService.current?.off('error');
            wsc.current?.disconnect();
            wsc.current = null;
            replService.current = null;
        }
    }, []);

    const setCode = (code: string) => {
        setLatestCell({...latestCell, code});
    }

    const executeLatestCell = async () => {
        const code = latestCell.code;
        setLatestCell((cell) => ({...cell, state: 'compiling'}));
        let cTime:number, lTime:number, eTime: number;
        await replService.current?.execute(code, 
            (time) => {cTime = time; setLatestCell((cell) => ({...cell, state: 'loading'}));},
            (error) => setLatestCell(cell => ({...cell, state: 'editing', compileError: error})),
            (time) => {lTime = time; setLatestCell((cell) => ({...cell, state: 'executing'}));},
            (time) => {
                eTime = time; 
                setLatestCell({code:'', state: 'editing'});
                setExecutedCells((cells) => [...cells, {
                    state: 'executed', 
                    code: code, 
                    id:cells.length, 
                    time: {compilation: cTime, loading: lTime, execution: eTime}}
                ]);
            }
        );
    }

    return (
        <ReplContext.Provider value={{
            state: replState,
            latestCell,
            executedCells,
            logs,
            setCode,
            executeLatestCell,
        }}>
        {children}
        </ReplContext.Provider>
    )
}
