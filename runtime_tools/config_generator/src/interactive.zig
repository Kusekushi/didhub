const std = @import("std");
const config = @import("config.zig");

// ============================================================================
// Input Helpers
// ============================================================================

fn readLine(allocator: std.mem.Allocator, prompt: []const u8) ![]u8 {
    const stdout = std.fs.File.stdout().deprecatedWriter();
    try stdout.print("{s} ", .{prompt});
    const stdin = std.fs.File.stdin().deprecatedReader();
    const line = try stdin.readUntilDelimiterAlloc(allocator, '\n', 1000);
    const trimmed = std.mem.trim(u8, line, " \t\n\r");
    const buf = try allocator.dupe(u8, trimmed);
    allocator.free(line);
    return buf;
}

fn parseBool(input: []const u8, default: bool) bool {
    if (input.len == 0) return default;
    const lower = input[0];
    return lower == '1' or lower == 't' or lower == 'T' or lower == 'y' or lower == 'Y';
}

fn isNone(input: []const u8) bool {
    return input.len > 0 and std.ascii.eqlIgnoreCase(input, "none");
}

fn parseOptStr(input: []const u8) ?[]const u8 {
    return if (input.len == 0 or isNone(input)) null else input;
}

fn parseCommaSeparated(allocator: std.mem.Allocator, input: []const u8, list: anytype) !void {
    list.clearRetainingCapacity();
    if (input.len == 0) return;
    var parts = std.mem.tokenizeAny(u8, input, ",");
    while (parts.next()) |p| {
        const t = std.mem.trim(u8, p, " \t\n\r");
        if (t.len > 0) try list.append(allocator, t);
    }
}

// ============================================================================
// Section Configurators
// ============================================================================

fn configServer(allocator: std.mem.Allocator, cfg: *config.Config) !void {
    var s = try readLine(allocator, "server.host [0.0.0.0]:");
    if (s.len > 0) cfg.server.host = s;

    s = try readLine(allocator, "server.port [6000]:");
    if (s.len > 0) cfg.server.port = std.fmt.parseInt(u16, s, 10) catch cfg.server.port;
}

fn configLogging(allocator: std.mem.Allocator, cfg: *config.Config) !void {
    var s = try readLine(allocator, "logging.level [info]:");
    if (s.len > 0) cfg.logging.level = s;

    s = try readLine(allocator, "logging.json (true/false) [no]:");
    if (s.len > 0) cfg.logging.json = parseBool(s, cfg.logging.json);
}

fn configCors(allocator: std.mem.Allocator, cfg: *config.Config) !void {
    var s = try readLine(allocator, "cors.allowed_origins (comma-separated) []:");
    if (s.len > 0) try parseCommaSeparated(allocator, s, &cfg.cors.allowed_origins);

    s = try readLine(allocator, "cors.allow_all_origins (true/false) [no]:");
    if (s.len > 0) cfg.cors.allow_all_origins = parseBool(s, cfg.cors.allow_all_origins);
}

fn configDatabase(allocator: std.mem.Allocator, cfg: *config.Config) !void {
    var s = try readLine(allocator, "database.driver (sqlite|postgres|mysql) [sqlite]:");
    if (s.len > 0) cfg.database.driver = s;

    if (cfg.database.isSqlite()) {
        s = try readLine(allocator, "database.path [didhub.sqlite]:");
        if (s.len > 0) cfg.database.path = s;
        cfg.database.host = null;
        cfg.database.port = null;
        cfg.database.database = null;
    } else {
        s = try readLine(allocator, "database.host []:");
        if (s.len > 0) cfg.database.host = parseOptStr(s);

        s = try readLine(allocator, "database.port []:");
        if (s.len > 0) cfg.database.port = if (isNone(s)) null else std.fmt.parseInt(u16, s, 10) catch cfg.database.port;

        s = try readLine(allocator, "database.database []:");
        if (s.len > 0) cfg.database.database = parseOptStr(s);
    }

    s = try readLine(allocator, "database.username []:");
    if (s.len > 0) cfg.database.username = parseOptStr(s);

    s = try readLine(allocator, "database.password []:");
    if (s.len > 0) cfg.database.password = parseOptStr(s);

    s = try readLine(allocator, "database.ssl_mode []:");
    if (s.len > 0) cfg.database.ssl_mode = parseOptStr(s);
}

fn configUploads(allocator: std.mem.Allocator, cfg: *config.Config) !void {
    const s = try readLine(allocator, "uploads.directory [./uploads]:");
    if (s.len > 0) cfg.uploads.directory = s;
}

fn configAutoUpdate(allocator: std.mem.Allocator, cfg: *config.Config) !void {
    var s = try readLine(allocator, "auto_update.enabled (true/false) [no]:");
    if (s.len > 0) cfg.auto_update.enabled = parseBool(s, cfg.auto_update.enabled);

    s = try readLine(allocator, "auto_update.check_enabled (true/false) [no]:");
    if (s.len > 0) cfg.auto_update.check_enabled = parseBool(s, cfg.auto_update.check_enabled);

    s = try readLine(allocator, "auto_update.repo []:");
    if (s.len > 0) cfg.auto_update.repo = parseOptStr(s);

    s = try readLine(allocator, "auto_update.check_interval_hours [24]:");
    if (s.len > 0) cfg.auto_update.check_interval_hours = std.fmt.parseInt(u32, s, 10) catch cfg.auto_update.check_interval_hours;
}

fn configRateLimit(allocator: std.mem.Allocator, cfg: *config.Config) !void {
    var s = try readLine(allocator, "rate_limit.enabled (true/false) [no]:");
    if (s.len > 0) cfg.rate_limit.enabled = parseBool(s, cfg.rate_limit.enabled);

    s = try readLine(allocator, "rate_limit.per_ip (true/false) [yes]:");
    if (s.len > 0) cfg.rate_limit.per_ip = parseBool(s, cfg.rate_limit.per_ip);

    s = try readLine(allocator, "rate_limit.per_user (true/false) [yes]:");
    if (s.len > 0) cfg.rate_limit.per_user = parseBool(s, cfg.rate_limit.per_user);

    s = try readLine(allocator, "rate_limit.rate_per_sec [100]:");
    if (s.len > 0) cfg.rate_limit.rate_per_sec = std.fmt.parseInt(u32, s, 10) catch cfg.rate_limit.rate_per_sec;

    s = try readLine(allocator, "rate_limit.burst [200]:");
    if (s.len > 0) cfg.rate_limit.burst = std.fmt.parseInt(u32, s, 10) catch cfg.rate_limit.burst;

    s = try readLine(allocator, "rate_limit.exempt_paths (comma-separated) [/health,/ready,/csrf-token]:");
    if (s.len > 0) try parseCommaSeparated(allocator, s, &cfg.rate_limit.exempt_paths);
}

fn configAuth(allocator: std.mem.Allocator, cfg: *config.Config) !void {
    var s = try readLine(allocator, "auth.jwt_pem []:");
    if (s.len > 0) cfg.auth.jwt_pem = parseOptStr(s);

    s = try readLine(allocator, "auth.jwt_pem_path []:");
    if (s.len > 0) cfg.auth.jwt_pem_path = parseOptStr(s);

    s = try readLine(allocator, "auth.jwt_secret []:");
    if (s.len > 0) cfg.auth.jwt_secret = parseOptStr(s);
}

// ============================================================================
// Public API
// ============================================================================

// Export helpers for use in tui.zig
pub const readLineAlloc = readLine;

pub fn gather_interactive(allocator: std.mem.Allocator, cfg: *config.Config) !void {
    const stdout = std.fs.File.stdout().deprecatedWriter();
    try stdout.writeAll(
        \\Choose sections to configure (comma-separated numbers) or press Enter for all:
        \\1) server    2) logging    3) cors       4) database
        \\5) uploads   6) auto_update 7) rate_limit 8) auth
        \\
    );

    const sel = try readLine(allocator, "Sections: (e.g. 1,4,8)");

    // Parse selection - default to all if empty
    const selected: u8 = if (sel.len == 0) 0xFF else blk: {
        var mask: u8 = 0;
        var parts = std.mem.tokenizeAny(u8, sel, ",");
        while (parts.next()) |p| {
            const t = std.mem.trim(u8, p, " \t\n\r");
            const n = std.fmt.parseInt(u8, t, 10) catch continue;
            if (n >= 1 and n <= 8) mask |= @as(u8, 1) << @intCast(n - 1);
        }
        break :blk mask;
    };

    // Configure selected sections
    const configurators = [_]*const fn (std.mem.Allocator, *config.Config) anyerror!void{
        configServer,
        configLogging,
        configCors,
        configDatabase,
        configUploads,
        configAutoUpdate,
        configRateLimit,
        configAuth,
    };

    for (configurators, 0..) |configurator, i| {
        if (selected & (@as(u8, 1) << @intCast(i)) != 0) {
            try configurator(allocator, cfg);
        }
    }
}
