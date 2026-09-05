// Autorun storage: a dedicated "autorun" partition holds the sealed LOAD/JUMP
// stream that bs_protocol_replay_autorun() replays at boot.
//
// Layout: header | stream bytes. Sectors are erased lazily during capture so
// the BEGIN command stays fast; the header is written last, sealing the
// stream, and records the RAM region addresses of the saving boot — if a
// later boot lands the regions elsewhere the stream is ignored.
#include <string.h>

#include "esp_partition.h"
#include "esp_rom_crc.h"

#include "include/memory.h"
#include "include/utils.h"

#define AUTORUN_PARTITION_LABEL "autorun"
#define AUTORUN_MAGIC 0x52415342u   // "BSAR"

typedef struct {
    uint32_t magic;
    uint32_t length;      // stream bytes after the header
    uint32_t crc;         // esp_rom_crc32_le(0, stream, length)
    uint32_t iram_address;
    uint32_t dram_address;
    uint32_t reserved[3];
} autorun_header_t;

static const esp_partition_t* s_part;
static const uint8_t* s_mapped;
static esp_partition_mmap_handle_t s_mmap_hdlr;

static uint32_t s_write_off;
static uint32_t s_erased_upto;
static uint32_t s_crc;
static bool s_overflowed;
static uint8_t s_acc[256];
static uint32_t s_acc_len;

static bool autorun_open(void) {
    if (s_part == NULL)
        s_part = esp_partition_find_first(ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_ANY,
                                          AUTORUN_PARTITION_LABEL);
    return s_part != NULL;
}

static void ensure_erased(uint32_t end) {
    while (s_erased_upto < end && s_erased_upto < s_part->size) {
        esp_partition_erase_range(s_part, s_erased_upto, 4096);
        s_erased_upto += 4096;
    }
}

// final: pad to word size with 0xFF (erased state, overwritable later).
static void flush_acc(bool final) {
    if (s_acc_len == 0 || s_overflowed)
        return;
    uint32_t n = s_acc_len;
    if (final) {
        uint32_t padded = (n + 3) & ~3u;
        memset(s_acc + n, 0xFF, padded - n);
        n = padded;
    }
    if (s_write_off + n > s_part->size) {
        s_overflowed = true;
        return;
    }
    ensure_erased(s_write_off + n);
    if (esp_partition_write(s_part, s_write_off, s_acc, n) != ESP_OK)
        s_overflowed = true;
    s_write_off += s_acc_len;
    s_acc_len = 0;
}

void bs_autorun_erase(void) {
    if (!autorun_open())
        return;
    s_erased_upto = 0;
    ensure_erased(4096);          // header sector; the rest erases lazily
    s_write_off = sizeof(autorun_header_t);
    s_acc_len = 0;
    s_crc = 0;
    s_overflowed = false;
}

void bs_autorun_append(const uint8_t* data, uint32_t len) {
    if (s_part == NULL || s_overflowed)
        return;
    s_crc = esp_rom_crc32_le(s_crc, data, len);
    while (len > 0) {
        uint32_t n = sizeof(s_acc) - s_acc_len;
        if (n > len)
            n = len;
        memcpy(s_acc + s_acc_len, data, n);
        s_acc_len += n;
        data += n;
        len -= n;
        if (s_acc_len == sizeof(s_acc))
            flush_acc(false);
    }
}

int bs_autorun_finalize(void) {
    if (s_part == NULL)
        return 0;
    flush_acc(true);
    if (s_overflowed) {
        BS_LOG_ERROR("Autorun: stream does not fit the partition (%d bytes)", (int)s_part->size);
        return 0;
    }
    bs_memory_layout_t layout;
    bs_memory_get_layout(&layout);
    autorun_header_t h = {
        .magic = AUTORUN_MAGIC,
        .length = s_write_off - sizeof(autorun_header_t),
        .crc = s_crc,
        .iram_address = (uint32_t)layout.iram_address,
        .dram_address = (uint32_t)layout.dram_address,
        .reserved = {0, 0, 0},
    };
    if (esp_partition_write(s_part, 0, &h, sizeof(h)) != ESP_OK)
        return 0;
    BS_LOG_INFO("Autorun: sealed %d bytes", (int)h.length);
    return 1;
}

uint32_t bs_autorun_read(const uint8_t** data) {
    *data = NULL;
    if (!autorun_open())
        return 0;
    if (s_mapped == NULL &&
        esp_partition_mmap(s_part, 0, s_part->size, ESP_PARTITION_MMAP_DATA,
                           (const void**)&s_mapped, &s_mmap_hdlr) != ESP_OK)
        return 0;
    const autorun_header_t* h = (const autorun_header_t*)s_mapped;
    if (h->magic != AUTORUN_MAGIC || h->length == 0 ||
        h->length > s_part->size - sizeof(*h))
        return 0;
    bs_memory_layout_t layout;
    bs_memory_get_layout(&layout);
    if (h->iram_address != (uint32_t)layout.iram_address || h->dram_address != (uint32_t)layout.dram_address) {
        BS_LOG_ERROR("Autorun: RAM layout changed since the save, ignoring the stored program");
        return 0;
    }
    if (esp_rom_crc32_le(0, s_mapped + sizeof(*h), h->length) != h->crc) {
        BS_LOG_ERROR("Autorun: stored stream is corrupt, ignoring it");
        return 0;
    }
    *data = s_mapped + sizeof(*h);
    return h->length;
}
