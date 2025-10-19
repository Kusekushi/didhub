const std = @import("std");
const builtin = @import("builtin");
const config = @import("config.zig");

// Windows console API for better terminal control
const windows = if (builtin.os.tag == .windows) struct {
    extern "kernel32" fn GetConsoleMode(hConsoleHandle: std.os.windows.HANDLE, lpMode: *u32) i32;
    extern "kernel32" fn SetConsoleMode(hConsoleHandle: std.os.windows.HANDLE, dwMode: u32) i32;
    extern "kernel32" fn ReadConsoleInputW(hConsoleInput: std.os.windows.HANDLE, lpBuffer: [*]INPUT_RECORD, nLength: u32, lpNumberOfEventsRead: *u32) i32;
    extern "kernel32" fn GetStdHandle(nStdHandle: u32) std.os.windows.HANDLE;

    const STD_INPUT_HANDLE: u32 = 0xFFFFFFF6;
    const STD_OUTPUT_HANDLE: u32 = 0xFFFFFFF5;
    const ENABLE_VIRTUAL_TERMINAL_PROCESSING: u32 = 0x0004;
    const ENABLE_LINE_INPUT: u32 = 0x0002;
    const ENABLE_ECHO_INPUT: u32 = 0x0004;
    const ENABLE_PROCESSED_INPUT: u32 = 0x0001;

    pub const INPUT_RECORD = extern struct {
        EventType: u16,
        Event: extern union {
            KeyEvent: KEY_EVENT_RECORD,
            MouseEvent: MOUSE_EVENT_RECORD,
            WindowBufferSizeEvent: WINDOW_BUFFER_SIZE_RECORD,
            MenuEvent: MENU_EVENT_RECORD,
            FocusEvent: FOCUS_EVENT_RECORD,
        },
    };

    pub const KEY_EVENT_RECORD = extern struct {
        bKeyDown: i32,
        wRepeatCount: u16,
        wVirtualKeyCode: u16,
        wVirtualScanCode: u16,
        uChar: extern union { UnicodeChar: u16, AsciiChar: u8 },
        dwControlKeyState: u32,
    };

    pub const MOUSE_EVENT_RECORD = extern struct {
        dwMousePosition: std.os.windows.COORD,
        dwButtonState: u32,
        dwControlKeyState: u32,
        dwEventFlags: u32,
    };

    pub const WINDOW_BUFFER_SIZE_RECORD = extern struct { dwSize: std.os.windows.COORD };
    pub const MENU_EVENT_RECORD = extern struct { dwCommandId: u32 };
    pub const FOCUS_EVENT_RECORD = extern struct { bSetFocus: i32 };
} else struct {};

// ============================================================================
// Terminal Control
// ============================================================================

pub const Terminal = struct {
    stdout: @TypeOf(std.fs.File.stdout().deprecatedWriter()),

    pub fn init() Terminal {
        if (builtin.os.tag == .windows) {
            const hStdin = windows.GetStdHandle(windows.STD_INPUT_HANDLE);
            const hStdout = windows.GetStdHandle(windows.STD_OUTPUT_HANDLE);

            if (hStdin != std.os.windows.INVALID_HANDLE_VALUE) {
                var mode: u32 = 0;
                if (windows.GetConsoleMode(hStdin, &mode) != 0) {
                    _ = windows.SetConsoleMode(hStdin, mode & ~@as(u32, windows.ENABLE_LINE_INPUT | windows.ENABLE_ECHO_INPUT));
                }
            }
            if (hStdout != std.os.windows.INVALID_HANDLE_VALUE) {
                var mode: u32 = 0;
                if (windows.GetConsoleMode(hStdout, &mode) != 0) {
                    _ = windows.SetConsoleMode(hStdout, mode | windows.ENABLE_VIRTUAL_TERMINAL_PROCESSING);
                }
            }
        }
        return .{ .stdout = std.fs.File.stdout().deprecatedWriter() };
    }

    pub fn clearScreen(self: *Terminal) !void {
        try self.stdout.writeAll("\x1b[2J\x1b[H");
    }

    pub fn moveCursor(self: *Terminal, row: usize, col: usize) !void {
        try self.stdout.print("\x1b[{d};{d}H", .{ row + 1, col + 1 });
    }

    pub fn hideCursor(self: *Terminal) !void {
        try self.stdout.writeAll("\x1b[?25l");
    }

    pub fn showCursor(self: *Terminal) !void {
        try self.stdout.writeAll("\x1b[?25h");
    }

    pub fn setColor(self: *Terminal, fg: ?Color, bg: ?Color) !void {
        if (fg) |f| try self.stdout.print("\x1b[38;5;{d}m", .{@intFromEnum(f)});
        if (bg) |b| try self.stdout.print("\x1b[48;5;{d}m", .{@intFromEnum(b)});
    }

    pub fn resetColor(self: *Terminal) !void {
        try self.stdout.writeAll("\x1b[0m");
    }

    pub fn drawBox(self: *Terminal, x: usize, y: usize, width: usize, height: usize) !void {
        try self.moveCursor(y, x);
        try self.stdout.writeAll("+");
        for (0..width - 2) |_| try self.stdout.writeAll("-");
        try self.stdout.writeAll("+");

        for (1..height - 1) |i| {
            try self.moveCursor(y + i, x);
            try self.stdout.writeAll("|");
            try self.moveCursor(y + i, x + width - 1);
            try self.stdout.writeAll("|");
        }

        try self.moveCursor(y + height - 1, x);
        try self.stdout.writeAll("+");
        for (0..width - 2) |_| try self.stdout.writeAll("-");
        try self.stdout.writeAll("+");
    }

    pub fn printAt(self: *Terminal, x: usize, y: usize, text: []const u8) !void {
        try self.moveCursor(y, x);
        try self.stdout.writeAll(text);
    }

    pub fn printCentered(self: *Terminal, y: usize, text: []const u8, width: usize) !void {
        try self.printAt((width - text.len) / 2, y, text);
    }

    pub fn clearLine(self: *Terminal, y: usize, x: usize, width: usize) !void {
        try self.moveCursor(y, x);
        for (0..width) |_| try self.stdout.writeAll(" ");
    }
};

pub const Color = enum(u8) {
    black = 0,
    red = 1,
    green = 2,
    yellow = 3,
    blue = 4,
    magenta = 5,
    cyan = 6,
    white = 7,
    bright_black = 8,
    bright_red = 9,
    bright_green = 10,
    bright_yellow = 11,
    bright_blue = 12,
    bright_magenta = 13,
    bright_cyan = 14,
    bright_white = 15,
};

// ============================================================================
// Input Handling
// ============================================================================

pub const Key = enum { up, down, left, right, enter, escape, tab, backspace, character, unknown };

pub const InputResult = struct { key: Key, char: ?u8 };

pub fn readKey() !InputResult {
    if (builtin.os.tag == .windows) {
        return readKeyWindows();
    }
    return readKeyUnix();
}

// Alias for backward compatibility
pub const readKeySimple = readKey;

fn readKeyWindows() !InputResult {
    const handle = windows.GetStdHandle(windows.STD_INPUT_HANDLE);
    var mode: u32 = 0;
    if (windows.GetConsoleMode(handle, &mode) == 0) return error.GetConsoleModeFailed;

    const raw_mode = mode & ~@as(u32, windows.ENABLE_LINE_INPUT | windows.ENABLE_ECHO_INPUT | windows.ENABLE_PROCESSED_INPUT);
    if (windows.SetConsoleMode(handle, raw_mode) == 0) return error.SetConsoleModeFailed;
    defer _ = windows.SetConsoleMode(handle, mode);

    var input_record: [1]windows.INPUT_RECORD = undefined;
    var events_read: u32 = 0;

    while (true) {
        if (windows.ReadConsoleInputW(handle, &input_record, 1, &events_read) == 0) return error.ReadConsoleInputFailed;
        if (events_read > 0 and input_record[0].EventType == 0x0001) {
            const ke = input_record[0].Event.KeyEvent;
            if (ke.bKeyDown != 0) {
                return mapKeyInput(ke.wVirtualKeyCode, ke.uChar.AsciiChar);
            }
        }
    }
}

fn readKeyUnix() !InputResult {
    var buf: [1]u8 = undefined;
    const n = std.fs.File.stdin().read(&buf) catch |err| {
        return if (err == error.WouldBlock) InputResult{ .key = .unknown, .char = null } else err;
    };
    if (n == 0) return InputResult{ .key = .unknown, .char = null };
    return mapCharInput(buf[0]);
}

fn mapKeyInput(vk: u16, char: u8) InputResult {
    return switch (vk) {
        0x0D => .{ .key = .enter, .char = null },
        0x1B => .{ .key = .escape, .char = null },
        0x09 => .{ .key = .tab, .char = null },
        0x08 => .{ .key = .backspace, .char = null },
        0x25 => .{ .key = .left, .char = null },
        0x26 => .{ .key = .up, .char = null },
        0x27 => .{ .key = .right, .char = null },
        0x28 => .{ .key = .down, .char = null },
        else => if (char >= 32 and char <= 126)
            .{ .key = .character, .char = char }
        else
            mapNavChar(char),
    };
}

fn mapCharInput(char: u8) InputResult {
    return switch (char) {
        '\n', '\r' => .{ .key = .enter, .char = null },
        '\t' => .{ .key = .tab, .char = null },
        127, '\x08' => .{ .key = .backspace, .char = null },
        else => if (char >= 32 and char <= 126)
            .{ .key = .character, .char = char }
        else
            .{ .key = .unknown, .char = null },
    };
}

fn mapNavChar(char: u8) InputResult {
    return switch (char) {
        'w', 'W', 'k', 'K' => .{ .key = .up, .char = null },
        's', 'S', 'j', 'J' => .{ .key = .down, .char = null },
        'a', 'A', 'h', 'H' => .{ .key = .left, .char = null },
        'd', 'D', 'l', 'L' => .{ .key = .right, .char = null },
        'q', 'Q' => .{ .key = .escape, .char = null },
        else => .{ .key = .unknown, .char = null },
    };
}

// ============================================================================
// Form Field Types
// ============================================================================

pub const FieldType = enum { text, checkbox, dropdown };

pub const FieldValue = union(FieldType) {
    text: std.ArrayList(u8),
    checkbox: bool,
    dropdown: struct { options: []const []const u8, selected: usize },
};

pub const FormField = struct {
    label: []const u8,
    value: FieldValue,
    y: usize,
    cursor_pos: usize = 0,
    allocator: ?std.mem.Allocator = null,

    const Self = @This();

    pub fn initText(allocator: std.mem.Allocator, label: []const u8, y: usize, initial: []const u8) !Self {
        var list = try std.ArrayList(u8).initCapacity(allocator, initial.len);
        if (initial.len > 0) {
            @memcpy(list.items.ptr[0..initial.len], initial);
            list.items.len = initial.len;
        }
        return .{ .label = label, .value = .{ .text = list }, .y = y, .cursor_pos = initial.len, .allocator = allocator };
    }

    pub fn initCheckbox(label: []const u8, y: usize, checked: bool) Self {
        return .{ .label = label, .value = .{ .checkbox = checked }, .y = y };
    }

    pub fn initDropdown(label: []const u8, y: usize, options: []const []const u8, selected: usize) Self {
        return .{ .label = label, .value = .{ .dropdown = .{ .options = options, .selected = selected } }, .y = y };
    }

    pub fn deinit(self: *Self) void {
        if (self.allocator) |alloc| {
            switch (self.value) {
                .text => |*t| t.deinit(alloc),
                else => {},
            }
        }
    }

    pub fn getText(self: *const Self) []const u8 {
        return switch (self.value) {
            .text => |t| t.items,
            else => "",
        };
    }

    pub fn isChecked(self: *const Self) bool {
        return switch (self.value) {
            .checkbox => |c| c,
            else => false,
        };
    }

    pub fn getSelectedValue(self: *const Self) []const u8 {
        return switch (self.value) {
            .dropdown => |d| d.options[d.selected],
            else => "",
        };
    }

    pub fn draw(self: *Self, term: *Terminal, x: usize, width: usize, active: bool) !void {
        try term.clearLine(self.y, x, width);
        try term.moveCursor(self.y, x);
        try term.stdout.print("{s}: ", .{self.label});

        const field_x = x + self.label.len + 2;

        switch (self.value) {
            .text => |t| {
                try term.stdout.writeAll("[");
                const display_w = width - self.label.len - 5;
                const start = if (self.cursor_pos >= display_w) self.cursor_pos - display_w + 1 else 0;
                const end = @min(start + display_w, t.items.len);
                for (t.items[start..end]) |c| try term.stdout.print("{c}", .{c});
                for (0..display_w -| (end - start)) |_| try term.stdout.writeAll(" ");
                try term.stdout.writeAll("]");
                if (active) try term.moveCursor(self.y, field_x + 1 + self.cursor_pos - start);
            },
            .checkbox => |c| {
                try term.stdout.print("[{c}]", .{@as(u8, if (c) 'X' else ' ')});
                if (active) try term.moveCursor(self.y, field_x + 1);
            },
            .dropdown => |d| {
                if (active) try term.setColor(.bright_white, .blue);
                try term.stdout.print("{s}", .{d.options[d.selected]});
                if (active) try term.resetColor();
                try term.stdout.writeAll(" [</>]");
            },
        }
    }

    pub fn handleInput(self: *Self, input: InputResult) !void {
        switch (self.value) {
            .text => |*t| {
                const alloc = self.allocator orelse return;
                switch (input.key) {
                    .left => self.cursor_pos -|= 1,
                    .right => self.cursor_pos = @min(self.cursor_pos + 1, t.items.len),
                    .backspace => {
                        if (self.cursor_pos > 0) {
                            _ = t.orderedRemove(self.cursor_pos - 1);
                            self.cursor_pos -= 1;
                        }
                    },
                    .character => if (input.char) |c| {
                        try t.insert(alloc, self.cursor_pos, c);
                        self.cursor_pos += 1;
                    },
                    else => {},
                }
            },
            .checkbox => |*c| {
                if (input.key == .enter or (input.key == .character and input.char != null and
                    (input.char.? == ' ' or input.char.? == 'x' or input.char.? == 'X')))
                {
                    c.* = !c.*;
                }
            },
            .dropdown => |*d| {
                switch (input.key) {
                    .left => d.selected -|= 1,
                    .right => d.selected = @min(d.selected + 1, d.options.len - 1),
                    else => {},
                }
            },
        }
    }
};

// ============================================================================
// Generic Form Handler
// ============================================================================

pub const Form = struct {
    term: *Terminal,
    title: []const u8,
    fields: []FormField,
    current: usize = 0,
    box_height: usize,

    const Self = @This();

    pub fn init(term: *Terminal, title: []const u8, fields: []FormField, box_height: usize) Self {
        return .{ .term = term, .title = title, .fields = fields, .box_height = box_height };
    }

    pub fn run(self: *Self) !bool {
        try self.term.clearScreen();
        try self.term.printCentered(0, self.title, 80);
        try self.term.drawBox(0, 1, 80, self.box_height);
        try self.term.showCursor();
        defer self.term.hideCursor() catch {};

        while (true) {
            // Draw all fields
            for (self.fields, 0..) |*field, i| {
                try field.draw(self.term, 5, 70, i == self.current);
            }

            // Status line
            const status_y = self.box_height;
            try self.term.clearLine(status_y, 5, 70);
            try self.term.printAt(5, status_y, "Tab: next | Enter: save | ESC: cancel");

            // Ensure cursor is in active field
            try self.fields[self.current].draw(self.term, 5, 70, true);

            const input = readKey() catch |err| {
                if (err == error.EndOfStream) return false;
                return err;
            };

            switch (input.key) {
                .escape => return false,
                .enter => return true,
                .tab => self.current = (self.current + 1) % self.fields.len,
                else => try self.fields[self.current].handleInput(input),
            }
        }
    }
};

// ============================================================================
// Menu Component
// ============================================================================

pub const Menu = struct {
    items: []const []const u8,
    selected_index: usize = 0,
    x: usize,
    y: usize,
    width: usize,

    pub fn draw(self: *Menu, term: *Terminal) !void {
        for (self.items, 0..) |item, i| {
            try term.clearLine(self.y + i, self.x, self.width);
            try term.moveCursor(self.y + i, self.x);
            if (i == self.selected_index) {
                try term.setColor(.bright_white, .blue);
                try term.stdout.print("> {s}", .{item});
                try term.resetColor();
            } else {
                try term.stdout.print("  {s}", .{item});
            }
        }
    }

    pub fn handleInput(self: *Menu, input: InputResult) bool {
        switch (input.key) {
            .up => self.selected_index -|= 1,
            .down => self.selected_index = @min(self.selected_index + 1, self.items.len - 1),
            .character => if (input.char) |c| switch (c) {
                'w', 'W', 'k', 'K' => self.selected_index -|= 1,
                's', 'S', 'j', 'J' => self.selected_index = @min(self.selected_index + 1, self.items.len - 1),
                else => {},
            },
            else => {},
        }
        return false;
    }

    // Legacy compatibility - init and deinit for allocated menus
    pub fn init(allocator: std.mem.Allocator, labels: []const []const u8, x: usize, y: usize, width: usize) !Menu {
        _ = allocator;
        return Menu{ .items = labels, .x = x, .y = y, .width = width };
    }

    pub fn deinit(self: *Menu, allocator: std.mem.Allocator) void {
        _ = self;
        _ = allocator;
    }
};

// ============================================================================
// Helper Functions
// ============================================================================

fn formatInt(buf: []u8, value: anytype) ![]const u8 {
    return try std.fmt.bufPrint(buf, "{}", .{value});
}

fn saveOptionalText(allocator: std.mem.Allocator, text: []const u8) !?[]const u8 {
    return if (text.len > 0) try allocator.dupe(u8, text) else null;
}

fn parseCommaSeparated(allocator: std.mem.Allocator, text: []const u8, list: anytype) !void {
    list.clearRetainingCapacity();
    if (text.len == 0) return;
    var parts = std.mem.tokenizeAny(u8, text, ",");
    while (parts.next()) |p| {
        const t = std.mem.trim(u8, p, " \t\n\r");
        if (t.len > 0) try list.append(allocator, t);
    }
}

// ============================================================================
// Main TUI Entry Point
// ============================================================================

pub fn gather_interactive_tui(allocator: std.mem.Allocator, cfg: *config.Config) !void {
    var term = Terminal.init();
    try term.clearScreen();
    try term.hideCursor();
    defer term.showCursor() catch {};

    const sections = [_][]const u8{
        "Server Configuration",
        "Logging Configuration",
        "CORS Configuration",
        "Database Configuration",
        "Uploads Configuration",
        "Auto Update Configuration",
        "Rate Limit Configuration",
        "Auth Configuration",
    };

    var menu = Menu{ .items = &sections, .x = 2, .y = 2, .width = 30 };

    while (true) {
        try term.clearScreen();
        try term.printCentered(0, "DIDHub Configuration Generator", 80);
        try term.drawBox(0, 1, 80, 15);
        try menu.draw(&term);
        try term.printAt(2, 12, "Use W/S or K/J to navigate, Enter to select, Q to finish");

        const input = readKey() catch break;

        switch (input.key) {
            .enter => {
                const saved = switch (menu.selected_index) {
                    0 => try configureServer(&term, allocator, cfg),
                    1 => try configureLogging(&term, allocator, cfg),
                    2 => try configureCors(&term, allocator, cfg),
                    3 => try configureDatabase(&term, allocator, cfg),
                    4 => try configureUploads(&term, allocator, cfg),
                    5 => try configureAutoUpdate(&term, allocator, cfg),
                    6 => try configureRateLimit(&term, allocator, cfg),
                    7 => try configureAuth(&term, allocator, cfg),
                    else => false,
                };
                _ = saved;
            },
            .escape => break,
            else => _ = menu.handleInput(input),
        }
    }

    try term.clearScreen();
}

// ============================================================================
// Configuration Screens
// ============================================================================

fn configureServer(term: *Terminal, allocator: std.mem.Allocator, cfg: *config.Config) !bool {
    var buf: [16]u8 = undefined;
    var fields = [_]FormField{
        try FormField.initText(allocator, "Host", 3, cfg.server.host),
        try FormField.initText(allocator, "Port", 5, try formatInt(&buf, cfg.server.port)),
    };
    defer for (&fields) |*f| f.deinit();

    var form = Form.init(term, "Server Configuration", &fields, 10);
    if (try form.run()) {
        cfg.server.host = try allocator.dupe(u8, fields[0].getText());
        cfg.server.port = std.fmt.parseInt(u16, fields[1].getText(), 10) catch cfg.server.port;
        return true;
    }
    return false;
}

fn configureLogging(term: *Terminal, allocator: std.mem.Allocator, cfg: *config.Config) !bool {
    const levels = [_][]const u8{ "trace", "debug", "info", "warn", "error" };
    var level_idx: usize = 2;
    for (levels, 0..) |lvl, i| {
        if (std.mem.eql(u8, lvl, cfg.logging.level)) {
            level_idx = i;
            break;
        }
    }

    var fields = [_]FormField{
        FormField.initDropdown("Level", 3, &levels, level_idx),
        FormField.initCheckbox("JSON output", 5, cfg.logging.json),
    };

    var form = Form.init(term, "Logging Configuration", &fields, 10);
    if (try form.run()) {
        cfg.logging.level = try allocator.dupe(u8, fields[0].getSelectedValue());
        cfg.logging.json = fields[1].isChecked();
        return true;
    }
    return false;
}

fn configureCors(term: *Terminal, allocator: std.mem.Allocator, cfg: *config.Config) !bool {
    var fields = [_]FormField{
        try FormField.initText(allocator, "Allowed origins (comma-sep)", 3, ""),
        FormField.initCheckbox("Allow all origins", 5, cfg.cors.allow_all_origins),
    };
    defer fields[0].deinit();

    var form = Form.init(term, "CORS Configuration", &fields, 10);
    if (try form.run()) {
        try parseCommaSeparated(allocator, fields[0].getText(), &cfg.cors.allowed_origins);
        cfg.cors.allow_all_origins = fields[1].isChecked();
        return true;
    }
    return false;
}

fn configureDatabase(term: *Terminal, allocator: std.mem.Allocator, cfg: *config.Config) !bool {
    var port_buf: [16]u8 = undefined;
    var port_str: []const u8 = "";
    if (cfg.database.port) |p| port_str = try formatInt(&port_buf, p);

    var fields = [_]FormField{
        try FormField.initText(allocator, "Driver (sqlite|postgres|mysql)", 3, cfg.database.driver),
        try FormField.initText(allocator, "Host", 5, cfg.database.host orelse ""),
        try FormField.initText(allocator, "Port", 7, port_str),
        try FormField.initText(allocator, "Database", 9, cfg.database.database orelse ""),
        try FormField.initText(allocator, "Path (SQLite)", 11, cfg.database.path orelse ""),
        try FormField.initText(allocator, "Username", 13, cfg.database.username orelse ""),
        try FormField.initText(allocator, "Password", 15, cfg.database.password orelse ""),
    };
    defer for (&fields) |*f| f.deinit();

    var form = Form.init(term, "Database Configuration", &fields, 20);
    if (try form.run()) {
        cfg.database.driver = try allocator.dupe(u8, fields[0].getText());
        cfg.database.host = try saveOptionalText(allocator, fields[1].getText());
        const port_text = fields[2].getText();
        cfg.database.port = if (port_text.len > 0) std.fmt.parseInt(u16, port_text, 10) catch null else null;
        cfg.database.database = try saveOptionalText(allocator, fields[3].getText());
        cfg.database.path = try saveOptionalText(allocator, fields[4].getText());
        cfg.database.username = try saveOptionalText(allocator, fields[5].getText());
        cfg.database.password = try saveOptionalText(allocator, fields[6].getText());
        return true;
    }
    return false;
}

fn configureUploads(term: *Terminal, allocator: std.mem.Allocator, cfg: *config.Config) !bool {
    var fields = [_]FormField{
        try FormField.initText(allocator, "Directory", 3, cfg.uploads.directory),
    };
    defer fields[0].deinit();

    var form = Form.init(term, "Uploads Configuration", &fields, 8);
    if (try form.run()) {
        cfg.uploads.directory = try allocator.dupe(u8, fields[0].getText());
        return true;
    }
    return false;
}

fn configureAutoUpdate(term: *Terminal, allocator: std.mem.Allocator, cfg: *config.Config) !bool {
    var buf: [16]u8 = undefined;
    var fields = [_]FormField{
        FormField.initCheckbox("Enabled", 3, cfg.auto_update.enabled),
        FormField.initCheckbox("Check enabled", 5, cfg.auto_update.check_enabled),
        try FormField.initText(allocator, "Repository", 7, cfg.auto_update.repo orelse ""),
        try FormField.initText(allocator, "Check interval (hours)", 9, try formatInt(&buf, cfg.auto_update.check_interval_hours)),
    };
    defer {
        fields[2].deinit();
        fields[3].deinit();
    }

    var form = Form.init(term, "Auto Update Configuration", &fields, 14);
    if (try form.run()) {
        cfg.auto_update.enabled = fields[0].isChecked();
        cfg.auto_update.check_enabled = fields[1].isChecked();
        cfg.auto_update.repo = try saveOptionalText(allocator, fields[2].getText());
        cfg.auto_update.check_interval_hours = std.fmt.parseInt(u32, fields[3].getText(), 10) catch cfg.auto_update.check_interval_hours;
        return true;
    }
    return false;
}

fn configureRateLimit(term: *Terminal, allocator: std.mem.Allocator, cfg: *config.Config) !bool {
    var rate_buf: [16]u8 = undefined;
    var burst_buf: [16]u8 = undefined;
    var fields = [_]FormField{
        FormField.initCheckbox("Enabled", 3, cfg.rate_limit.enabled),
        FormField.initCheckbox("Per IP", 5, cfg.rate_limit.per_ip),
        FormField.initCheckbox("Per User", 7, cfg.rate_limit.per_user),
        try FormField.initText(allocator, "Rate per second", 9, try formatInt(&rate_buf, cfg.rate_limit.rate_per_sec)),
        try FormField.initText(allocator, "Burst", 11, try formatInt(&burst_buf, cfg.rate_limit.burst)),
        try FormField.initText(allocator, "Exempt paths (comma-sep)", 13, ""),
    };
    defer {
        fields[3].deinit();
        fields[4].deinit();
        fields[5].deinit();
    }

    var form = Form.init(term, "Rate Limit Configuration", &fields, 18);
    if (try form.run()) {
        cfg.rate_limit.enabled = fields[0].isChecked();
        cfg.rate_limit.per_ip = fields[1].isChecked();
        cfg.rate_limit.per_user = fields[2].isChecked();
        cfg.rate_limit.rate_per_sec = std.fmt.parseInt(u32, fields[3].getText(), 10) catch cfg.rate_limit.rate_per_sec;
        cfg.rate_limit.burst = std.fmt.parseInt(u32, fields[4].getText(), 10) catch cfg.rate_limit.burst;
        try parseCommaSeparated(allocator, fields[5].getText(), &cfg.rate_limit.exempt_paths);
        return true;
    }
    return false;
}

fn configureAuth(term: *Terminal, allocator: std.mem.Allocator, cfg: *config.Config) !bool {
    var fields = [_]FormField{
        try FormField.initText(allocator, "JWT PEM", 3, cfg.auth.jwt_pem orelse ""),
        try FormField.initText(allocator, "JWT PEM path", 5, cfg.auth.jwt_pem_path orelse ""),
        try FormField.initText(allocator, "JWT secret", 7, cfg.auth.jwt_secret orelse ""),
    };
    defer for (&fields) |*f| f.deinit();

    var form = Form.init(term, "Auth Configuration", &fields, 12);
    if (try form.run()) {
        cfg.auth.jwt_pem = try saveOptionalText(allocator, fields[0].getText());
        cfg.auth.jwt_pem_path = try saveOptionalText(allocator, fields[1].getText());
        cfg.auth.jwt_secret = try saveOptionalText(allocator, fields[2].getText());
        return true;
    }
    return false;
}
