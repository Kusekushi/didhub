const std = @import("std");
const log = @import("log.zig");

pub const Allocator = std.mem.Allocator;

pub const LogIndex = struct {
    offset: u64, // File offset where this line starts
    length: u32, // Length of the line (including newline)
    level: log.LogLevel, // Pre-parsed level for filtering without re-reading

    pub const SIZE = @sizeOf(LogIndex);
};

/// Streaming log file reader that builds an index and reads on demand
pub const StreamingLogReader = struct {
    file: std.fs.File,
    index: std.ArrayList(LogIndex),
    allocator: Allocator,
    line_buffer: []u8,
    level_counts: [4]usize,
    read_cache: struct {
        buffer: []u8,
        start_offset: u64,
        valid_len: usize,
    },

    const BUFFER_SIZE: usize = 64 * 1024; // 64KB
    const LINE_BUFFER_SIZE: usize = 8 * 1024; // 8KB for individual lines
    const INDEX_INITIAL_CAPACITY: usize = 16 * 1024; // Pre-allocate for ~16K entries

    pub fn init(allocator: Allocator, file_path: []const u8) !StreamingLogReader {
        const file = try std.fs.cwd().openFile(file_path, .{});
        errdefer file.close();

        var index = try std.ArrayList(LogIndex).initCapacity(allocator, INDEX_INITIAL_CAPACITY);
        errdefer index.deinit(allocator);

        const line_buffer = try allocator.alloc(u8, LINE_BUFFER_SIZE);
        errdefer allocator.free(line_buffer);

        const read_cache_buf = try allocator.alloc(u8, BUFFER_SIZE);
        errdefer allocator.free(read_cache_buf);

        var reader = StreamingLogReader{
            .file = file,
            .index = index,
            .allocator = allocator,
            .line_buffer = line_buffer,
            .level_counts = .{ 0, 0, 0, 0 },
            .read_cache = .{
                .buffer = read_cache_buf,
                .start_offset = 0,
                .valid_len = 0,
            },
        };

        try reader.buildIndex();
        return reader;
    }

    pub fn indexList(self: *const StreamingLogReader) *const std.ArrayList(LogIndex) {
        return &self.index;
    }

    pub fn deinit(self: *StreamingLogReader) void {
        self.file.close();
        self.index.deinit(self.allocator);
        self.allocator.free(self.line_buffer);
        self.allocator.free(self.read_cache.buffer);
    }

    /// Get cached level counts
    pub fn getLevelCounts(self: *const StreamingLogReader) struct { debug: usize, info: usize, warn: usize, err: usize } {
        return .{
            .debug = self.level_counts[0],
            .info = self.level_counts[1],
            .warn = self.level_counts[2],
            .err = self.level_counts[3],
        };
    }

    /// Build an index of all log lines by scanning the file once
    fn buildIndex(self: *StreamingLogReader) !void {
        try self.file.seekTo(0);

        var read_buffer: [BUFFER_SIZE]u8 = undefined;
        var line_start: u64 = 0;
        var file_offset: u64 = 0;

        // Use a fixed buffer for leftover data
        var leftover_buf: [LINE_BUFFER_SIZE]u8 = undefined;
        var leftover_len: usize = 0;

        while (true) {
            // Read directly into buffer after leftover
            const bytes_read = try self.file.read(read_buffer[leftover_len..]);
            if (bytes_read == 0 and leftover_len == 0) break;

            // Copy leftover to beginning
            if (leftover_len > 0) {
                @memcpy(read_buffer[0..leftover_len], leftover_buf[0..leftover_len]);
            }

            const total_len = leftover_len + bytes_read;
            const data = read_buffer[0..total_len];

            var pos: usize = 0;
            while (pos < total_len) {
                const remaining = data[pos..];
                const newline_idx = std.mem.indexOfScalar(u8, remaining, '\n');

                if (newline_idx) |nl| {
                    const line_end = pos + nl;
                    const line = data[pos..line_end];

                    const clean_line = if (line.len > 0 and line[line.len - 1] == '\r')
                        line[0 .. line.len - 1]
                    else
                        line;

                    if (log.parseLogLevel(clean_line)) |level| {
                        try self.index.append(self.allocator, .{
                            .offset = line_start,
                            .length = @intCast(nl + 1),
                            .level = level,
                        });
                        self.level_counts[@intFromEnum(level)] += 1;
                    }

                    line_start = file_offset + line_end + 1 - leftover_len;
                    pos = line_end + 1;
                } else {
                    // No newline found, save as leftover
                    break;
                }
            }

            // Handle last line if no more data coming
            if (bytes_read == 0 and pos < total_len) {
                const remaining = data[pos..];
                const clean_remaining = std.mem.trimRight(u8, remaining, "\r");
                if (log.parseLogLevel(clean_remaining)) |level| {
                    try self.index.append(self.allocator, .{
                        .offset = line_start,
                        .length = @intCast(remaining.len),
                        .level = level,
                    });
                    self.level_counts[@intFromEnum(level)] += 1;
                }
                break;
            }

            // Save leftover for next iteration
            leftover_len = total_len - pos;
            if (leftover_len > 0) {
                @memcpy(leftover_buf[0..leftover_len], data[pos..]);
            }
            file_offset += bytes_read;
        }

        // Shrink to fit if we over-allocated
        if (self.index.capacity > self.index.items.len * 2 and self.index.items.len > 0) {
            self.index.shrinkAndFree(self.allocator, self.index.items.len);
        }

        try self.file.seekTo(0);
    }

    fn readCached(self: *StreamingLogReader, offset: u64, len: usize) ![]const u8 {
        const cache = &self.read_cache;

        if (offset >= cache.start_offset and
            offset + len <= cache.start_offset + cache.valid_len)
        {
            const start = @as(usize, @intCast(offset - cache.start_offset));
            return cache.buffer[start .. start + len];
        }

        // Cache miss - read
        try self.file.seekTo(offset);

        cache.start_offset = offset;
        cache.valid_len = try self.file.read(cache.buffer);

        if (len > cache.valid_len) {
            return cache.buffer[0..cache.valid_len];
        }
        return cache.buffer[0..len];
    }

    /// Read a specific log entry by index
    pub fn readEntry(self: *StreamingLogReader, idx: usize) !?log.LogEntry {
        if (idx >= self.index.items.len) return null;

        const entry = self.index.items[idx];
        const len = @min(entry.length, self.line_buffer.len);

        const data = try self.readCached(entry.offset, len);
        if (data.len == 0) return null;

        const line = std.mem.trimRight(u8, data, "\r\n");
        return log.parse_log_line(line, self.allocator);
    }

    /// Read entry as a view
    pub fn readEntryView(self: *StreamingLogReader, idx: usize) !?log.LogEntryView {
        if (idx >= self.index.items.len) return null;

        const entry = self.index.items[idx];
        const len = @min(entry.length, self.line_buffer.len);

        const data = try self.readCached(entry.offset, len);
        if (data.len == 0) return null;

        const line = std.mem.trimRight(u8, data, "\r\n");
        return log.parseLogLineView(line);
    }

    /// Get total count of indexed log entries
    pub fn count(self: *const StreamingLogReader) usize {
        return self.index.items.len;
    }

    /// Get log level at index without reading full entry
    pub fn getLevelAt(self: *const StreamingLogReader, idx: usize) ?log.LogLevel {
        if (idx >= self.index.items.len) return null;
        return self.index.items[idx].level;
    }

    /// Read a range of entries
    pub fn readRange(self: *StreamingLogReader, start: usize, end: usize) !std.ArrayList(log.LogEntry) {
        var entries: std.ArrayList(log.LogEntry) = .empty;
        errdefer {
            for (entries.items) |e| {
                e.deinit(self.allocator);
            }
            entries.deinit(self.allocator);
        }

        const actual_end = @min(end, self.index.items.len);
        const range_size = if (actual_end > start) actual_end - start else 0;

        if (range_size == 0) return entries;

        try entries.ensureTotalCapacity(self.allocator, range_size);

        for (start..actual_end) |i| {
            if (try self.readEntry(i)) |entry| {
                entries.appendAssumeCapacity(entry);
            }
        }

        return entries;
    }

    /// Read only error entries using the index
    pub fn iterateErrors(self: *StreamingLogReader) ErrorIterator {
        return ErrorIterator{
            .reader = self,
            .current_idx = 0,
        };
    }

    pub const ErrorIterator = struct {
        reader: *StreamingLogReader,
        current_idx: usize,

        pub fn next(self: *ErrorIterator) !?log.LogEntry {
            while (self.current_idx < self.reader.index.items.len) {
                const idx = self.current_idx;
                self.current_idx += 1;

                if (self.reader.index.items[idx].level == .Error) {
                    return try self.reader.readEntry(idx);
                }
            }
            return null;
        }
    };
};
