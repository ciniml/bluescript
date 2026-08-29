#!/bin/bash
# Builds Espressif clang (Xtensa backend), ld.lld and llvm-ar as WebAssembly
# modules with Emscripten, so that BlueScript can compile for the ESP32 family
# without any native toolchain installed.
#
# Usage: tools/wasm-toolchain/build.sh [work-dir]
# Output: <work-dir>/build-wasm/bin/{clang,lld,llvm-ar}.{js,wasm} and lib/clang/<ver>/include
#
# Requirements: git, cmake >= 3.20, ninja, python3, a host C++ compiler, ~20 GB disk.
set -euo pipefail

LLVM_TAG=${LLVM_TAG:-esp-21.1.3_20260408}
W=${1:-$(pwd)/wasm-toolchain-build}
J=${J:-$(nproc)}
mkdir -p "$W" && cd "$W"

# 1. Sources and Emscripten
[ -d llvm ]  || git clone --depth 1 -b "$LLVM_TAG" https://github.com/espressif/llvm-project.git llvm
[ -d emsdk ] || git clone --depth 1 https://github.com/emscripten-core/emsdk.git
if [ ! -f emsdk/.emscripten ]; then (cd emsdk && ./emsdk install latest && ./emsdk activate latest); fi
source emsdk/emsdk_env.sh >/dev/null 2>&1

COMMON_FLAGS=(
  -DLLVM_ENABLE_PROJECTS="clang;lld"
  -DLLVM_TARGETS_TO_BUILD="" -DLLVM_EXPERIMENTAL_TARGETS_TO_BUILD=Xtensa
  -DLLVM_INCLUDE_TESTS=OFF -DLLVM_INCLUDE_BENCHMARKS=OFF -DLLVM_INCLUDE_EXAMPLES=OFF -DLLVM_INCLUDE_DOCS=OFF
  -DLLVM_ENABLE_ZLIB=OFF -DLLVM_ENABLE_ZSTD=OFF -DLLVM_ENABLE_LIBXML2=OFF
)

# 2. Native TableGen (needed to cross-compile LLVM)
mkdir -p build-native && cd build-native
[ -f build.ninja ] || cmake -G Ninja ../llvm/llvm -DCMAKE_BUILD_TYPE=Release "${COMMON_FLAGS[@]}"
ninja -j"$J" llvm-tblgen clang-tblgen llvm-min-tblgen
cd ..

# 3. WebAssembly build (MODULARIZE'd; run through run-wasm-tool.js)
LINK_FLAGS="-sALLOW_MEMORY_GROWTH=1 -sEXIT_RUNTIME=1 -sSTACK_SIZE=16MB -sINITIAL_MEMORY=512MB -sMAXIMUM_MEMORY=4GB"
LINK_FLAGS="$LINK_FLAGS -sENVIRONMENT=node -sMODULARIZE=1 -sEXPORT_NAME=createClang -sEXPORTED_RUNTIME_METHODS=FS,NODEFS,callMain -sINVOKE_RUN=0 -sFORCE_FILESYSTEM=1 -lnodefs.js"
mkdir -p build-wasm && cd build-wasm
[ -f build.ninja ] || emcmake cmake -G Ninja ../llvm/llvm -DCMAKE_BUILD_TYPE=MinSizeRel "${COMMON_FLAGS[@]}" \
  -DLLVM_HOST_TRIPLE=wasm32-unknown-emscripten -DLLVM_DEFAULT_TARGET_TRIPLE=xtensa-esp-elf \
  -DLLVM_TABLEGEN="$W/build-native/bin/llvm-tblgen" -DLLVM_HEADERS_TABLEGEN="$W/build-native/bin/llvm-min-tblgen" \
  -DCLANG_TABLEGEN="$W/build-native/bin/clang-tblgen" -DLLVM_NATIVE_TOOL_DIR="$W/build-native/bin" \
  -DLLVM_ENABLE_THREADS=OFF -DLLVM_ENABLE_PIC=OFF \
  -DLLVM_ENABLE_TERMINFO=OFF -DLLVM_ENABLE_LIBEDIT=OFF -DLLVM_ENABLE_LIBPFM=OFF \
  -DLLVM_ENABLE_BACKTRACES=OFF -DLLVM_ENABLE_CRASH_OVERRIDES=OFF -DLLVM_ENABLE_UNWIND_TABLES=OFF \
  -DLLVM_ENABLE_EH=OFF -DLLVM_ENABLE_RTTI=OFF -DLLVM_BUILD_TOOLS=ON -DLLVM_BUILD_UTILS=OFF \
  -DCLANG_ENABLE_ARCMT=OFF -DCLANG_ENABLE_STATIC_ANALYZER=OFF -DCLANG_INCLUDE_TESTS=OFF -DCLANG_INCLUDE_DOCS=OFF \
  -DCMAKE_EXE_LINKER_FLAGS="$LINK_FLAGS"
ninja -j"$J" clang lld llvm-ar
echo "Done: $W/build-wasm/bin"
