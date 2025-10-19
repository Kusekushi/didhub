const std = @import("std");
const log = @import("log.zig");
const reader = @import("reader.zig");

pub const Allocator = std.mem.Allocator;

const TerminalState = struct {
    stdout: std.fs.File,
    stdin: std.fs.File,
    output_buffer: [16384]u8,
    output_len: usize,
    original_mode: if (@import("builtin").target.os.tag == .windows) u32 else void,

    pub fn init() !TerminalState {
        const stdout = std.fs.File.stdout();
        const stdin = std.fs.File.stdin();

        var state = TerminalState{
            .stdout = stdout,
            .stdin = stdin,
            .output_buffer = undefined,
            .output_len = 0,
            .original_mode = if (@import("builtin").target.os.tag == .windows) 0 else {},
        };

        // Enable ANSI on Windows
        if (@import("builtin").target.os.tag == .windows) {
            const hStdout = std.os.windows.kernel32.GetStdHandle(std.os.windows.STD_OUTPUT_HANDLE);
            if (hStdout) |handle| {
                if (handle != std.os.windows.INVALID_HANDLE_VALUE) {
                    var mode: u32 = 0;
                    if (std.os.windows.kernel32.GetConsoleMode(handle, &mode) != 0) {
                        state.original_mode = mode;
                        _ = std.os.windows.kernel32.SetConsoleMode(handle, mode | 0x0004);
                    }
                }
            }
        }

        return state;
    }

    /// Append text to internal buffer
    pub fn write(self: *TerminalState, data: []const u8) void {
        const space = self.output_buffer.len - self.output_len;
        const to_copy = @min(data.len, space);
        @memcpy(self.output_buffer[self.output_len..][0..to_copy], data[0..to_copy]);
        self.output_len += to_copy;
    }

    /// Append formatted text to internal buffer
    pub fn print(self: *TerminalState, comptime fmt: []const u8, args: anytype) void {
        const remaining = self.output_buffer[self.output_len..];
        const written = std.fmt.bufPrint(remaining, fmt, args) catch return;
        self.output_len += written.len;
    }

    pub fn flush(self: *TerminalState) !void {
        if (self.output_len > 0) {
            try self.stdout.writeAll(self.output_buffer[0..self.output_len]);
            self.output_len = 0;
        }
    }

    pub fn clear(self: *TerminalState) void {
        self.output_len = 0;
    }

    pub fn readKey(self: *TerminalState) !?u8 {
        var buffer: [1]u8 = undefined;
        const bytes_read = try self.stdin.read(&buffer);
        if (bytes_read == 0) return null;
        return buffer[0];
    }

    pub fn readLine(self: *TerminalState, buf: []u8) !?[]const u8 {
        var pos: usize = 0;
        while (pos < buf.len) {
            var byte_buf: [1]u8 = undefined;
            const bytes_read = try self.stdin.read(&byte_buf);
            if (bytes_read == 0) break;
            if (byte_buf[0] == '\n') break;
            buf[pos] = byte_buf[0];
            pos += 1;
        }
        return if (pos > 0) buf[0..pos] else null;
    }
};

const DisplayState = struct {
    scroll_offset: usize,
    max_display: usize,
    search_term: ?[]const u8,
    filter_level: ?log.LogLevel,
    filtered_indices: std.ArrayList(usize),
    needs_redraw: bool,

    pub fn init(allocator: Allocator, total_count: usize) !DisplayState {
        var filtered_indices = try std.ArrayList(usize).initCapacity(allocator, total_count);
        for (0..total_count) |i| {
            filtered_indices.appendAssumeCapacity(i);
        }

        return DisplayState{
            .scroll_offset = 0,
            .max_display = 20,
            .search_term = null,
            .filter_level = null,
            .filtered_indices = filtered_indices,
            .needs_redraw = true,
        };
    }

    pub fn deinit(self: *DisplayState, allocator: Allocator) void {
        if (self.search_term) |term| allocator.free(term);
        self.filtered_indices.deinit(allocator);
    }

    pub fn rebuildFilters(self: *DisplayState, reader_ptr: *reader.StreamingLogReader) void {
        self.filtered_indices.clearRetainingCapacity();

        for (0..reader_ptr.count()) |i| {
            if (self.filter_level) |fl| {
                if (reader_ptr.getLevelAt(i)) |level| {
                    if (level != fl) continue;
                }
            }
            self.filtered_indices.append(reader_ptr.allocator, i) catch continue;
        }

        self.scroll_offset = 0;
        self.needs_redraw = true;
    }

    pub fn scrollDown(self: *DisplayState) void {
        if (self.scroll_offset + self.max_display < self.filtered_indices.items.len) {
            self.scroll_offset += 1;
            self.needs_redraw = true;
        }
    }

    pub fn scrollUp(self: *DisplayState) void {
        if (self.scroll_offset > 0) {
            self.scroll_offset -= 1;
            self.needs_redraw = true;
        }
    }

    pub fn pageDown(self: *DisplayState) void {
        const new_offset = self.scroll_offset + self.max_display;
        if (new_offset < self.filtered_indices.items.len) {
            self.scroll_offset = new_offset;
            self.needs_redraw = true;
        } else if (self.filtered_indices.items.len > self.max_display) {
            self.scroll_offset = self.filtered_indices.items.len - self.max_display;
            self.needs_redraw = true;
        }
    }

    pub fn pageUp(self: *DisplayState) void {
        if (self.scroll_offset >= self.max_display) {
            self.scroll_offset -= self.max_display;
        } else {
            self.scroll_offset = 0;
        }
        self.needs_redraw = true;
    }

    pub fn setSearchTerm(self: *DisplayState, allocator: Allocator, term: ?[]const u8) !void {
        if (self.search_term) |old| allocator.free(old);
        self.search_term = if (term) |t| try allocator.dupe(u8, t) else null;
        self.needs_redraw = true;
    }

    pub fn setFilterLevel(self: *DisplayState, level: ?log.LogLevel) void {
        self.filter_level = level;
        self.needs_redraw = true;
    }
};

pub fn run_tui(allocator: Allocator, input_file: ?[]const u8) !void {
    if (input_file) |file| {
        var rdr = try reader.StreamingLogReader.init(allocator, file);
        defer rdr.deinit();

        try tui_loop_streaming(allocator, &rdr);
    } else {
        std.debug.print("No input file specified for TUI. Use --input <file>\n", .{});
    }
}

pub fn tui_loop_streaming(allocator: Allocator, reader_ptr: *reader.StreamingLogReader) !void {
    var term = try TerminalState.init();
    var state = try DisplayState.init(allocator, reader_ptr.count());
    defer state.deinit(allocator);

    var search_buf: [256]u8 = undefined;
    var filter_buf: [16]u8 = undefined;

    while (true) {
        if (state.needs_redraw) {
            try renderScreen(&term, reader_ptr, &state);
            state.needs_redraw = false;
        }

        const key = try term.readKey() orelse continue;

        switch (key) {
            'q' => break,
            'j', '\n' => state.scrollDown(),
            'k' => state.scrollUp(),
            ' ' => state.pageDown(),
            'b' => state.pageUp(),
            'g' => {
                state.scroll_offset = 0;
                state.needs_redraw = true;
            },
            'G' => {
                if (state.filtered_indices.items.len > state.max_display) {
                    state.scroll_offset = state.filtered_indices.items.len - state.max_display;
                }
                state.needs_redraw = true;
            },
            'r' => {
                state.rebuildFilters(reader_ptr);
            },
            '/' => {
                term.write("\x1b[24;1HSearch: ");
                try term.flush();

                if (try term.readLine(&search_buf)) |search_input| {
                    const trimmed = std.mem.trim(u8, search_input, " \r\n");
                    try state.setSearchTerm(allocator, if (trimmed.len > 0) trimmed else null);
                }
            },
            'f' => {
                term.write("\x1b[24;1HFilter (d/i/w/e/Enter=clear): ");
                try term.flush();

                if (try term.readLine(&filter_buf)) |filter_input| {
                    const level_char = std.mem.trim(u8, filter_input, " \r\n");
                    const new_level: ?log.LogLevel = if (level_char.len == 0)
                        null
                    else switch (level_char[0]) {
                        'd' => .Debug,
                        'i' => .Info,
                        'w' => .Warn,
                        'e' => .Error,
                        else => state.filter_level,
                    };

                    state.setFilterLevel(new_level);
                    state.rebuildFilters(reader_ptr);
                }
            },
            '1' => {
                state.setFilterLevel(.Debug);
                state.rebuildFilters(reader_ptr);
            },
            '2' => {
                state.setFilterLevel(.Info);
                state.rebuildFilters(reader_ptr);
            },
            '3' => {
                state.setFilterLevel(.Warn);
                state.rebuildFilters(reader_ptr);
            },
            '4' => {
                state.setFilterLevel(.Error);
                state.rebuildFilters(reader_ptr);
            },
            '0' => {
                state.setFilterLevel(null);
                state.rebuildFilters(reader_ptr);
            },
            else => {},
        }
    }

    // Clear screen on exit
    term.write("\x1b[2J\x1b[H");
    try term.flush();
}

fn renderScreen(term: *TerminalState, reader_ptr: *reader.StreamingLogReader, state: *DisplayState) !void {
    // Clear buffer and screen
    term.clear();
    term.write("\x1b[2J\x1b[H");

    const counts = reader_ptr.getLevelCounts();

    term.print("\x1b[1mLog Analyzer TUI\x1b[0m | Total: {d} | Filtered: {d} | Pos: {d}\n", .{
        reader_ptr.count(),
        state.filtered_indices.items.len,
        state.scroll_offset,
    });
    term.print("Stats: \x1b[34mD:{d}\x1b[0m \x1b[32mI:{d}\x1b[0m \x1b[33mW:{d}\x1b[0m \x1b[31mE:{d}\x1b[0m\n", .{
        counts.debug,
        counts.info,
        counts.warn,
        counts.err,
    });

    // Display active filters
    if (state.search_term) |term_str| {
        term.print("Search: \x1b[33m{s}\x1b[0m | ", .{term_str});
    }
    if (state.filter_level) |level| {
        term.print("Filter: {s}{s}\x1b[0m", .{ level.color(), level.name() });
    }
    term.write("\n");

    term.write("--------------------------------------------------------------------------------\n");

    const display_start = state.scroll_offset;
    const display_end = @min(state.scroll_offset + state.max_display, state.filtered_indices.items.len);

    for (display_start..display_end) |display_idx| {
        const actual_idx = state.filtered_indices.items[display_idx];

        if (try reader_ptr.readEntryView(actual_idx)) |entry| {
            // Apply filter
            if (state.search_term) |term_str| {
                if (std.mem.indexOf(u8, entry.message, term_str) == null and
                    std.mem.indexOf(u8, entry.timestamp, term_str) == null)
                {
                    continue;
                }
            }

            // Truncate long messages
            const max_msg_len: usize = 60;
            const display_msg = if (entry.message.len > max_msg_len)
                entry.message[0..max_msg_len]
            else
                entry.message;

            const ellipsis: []const u8 = if (entry.message.len > max_msg_len) "..." else "";

            term.print("{s}{s} [{s}] {s}{s}\x1b[0m\n", .{
                entry.level.color(),
                entry.timestamp,
                entry.level.name(),
                display_msg,
                ellipsis,
            });
        }
    }

    term.write("--------------------------------------------------------------------------------\n");
    term.write("q:quit j/k:scroll Space/b:page g/G:top/bottom /:search f:filter 1-4:level 0:all\n");

    try term.flush();
}
