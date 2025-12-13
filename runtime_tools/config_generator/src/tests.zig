const std = @import("std");
const config = @import("config.zig");
const tui = @import("tui.zig");
const writers = @import("writers.zig");
const interactive = @import("interactive.zig");

test "config initialization" {
    const allocator = std.testing.allocator;
    var cfg = try config.Config.init(allocator);
    defer cfg.deinit();

    // Test default values
    try std.testing.expectEqualStrings("0.0.0.0", cfg.server.host);
    try std.testing.expectEqual(@as(u16, 6000), cfg.server.port);
    try std.testing.expectEqualStrings("info", cfg.logging.level);
    try std.testing.expectEqual(false, cfg.logging.json);
    try std.testing.expectEqualStrings("sqlite", cfg.database.driver);
    try std.testing.expectEqualStrings("didhub.sqlite", cfg.database.path.?);
}

test "config cloning" {
    const allocator = std.testing.allocator;
    var cfg = try config.Config.init(allocator);
    defer cfg.deinit();

    var cloned = try cfg.clone();
    defer cloned.deinit();

    // Test that clone has same values
    try std.testing.expectEqualStrings(cfg.server.host, cloned.server.host);
    try std.testing.expectEqual(cfg.server.port, cloned.server.port);
    try std.testing.expectEqualStrings(cfg.logging.level, cloned.logging.level);
    try std.testing.expectEqual(cfg.logging.json, cloned.logging.json);
}

test "config sections - server config" {
    const allocator = std.testing.allocator;
    var server = try config.ServerConfig.init(allocator);
    defer server.deinit(allocator);

    try std.testing.expectEqualStrings("0.0.0.0", server.host);
    try std.testing.expectEqual(@as(u16, 6000), server.port);

    var cloned = try server.clone(allocator);
    defer cloned.deinit(allocator);

    try std.testing.expectEqualStrings(server.host, cloned.host);
    try std.testing.expectEqual(server.port, cloned.port);
}

test "config sections - database config" {
    const allocator = std.testing.allocator;
    var db = try config.DatabaseConfig.init(allocator);
    defer db.deinit(allocator);

    try std.testing.expectEqualStrings("sqlite", db.driver);
    try std.testing.expectEqualStrings("didhub.sqlite", db.path.?);
    try std.testing.expect(db.isSqlite());

    // Test non-sqlite
    allocator.free(db.driver);
    db.driver = try allocator.dupe(u8, "postgres");
    try std.testing.expect(!db.isSqlite());

    var cloned = try db.clone(allocator);
    defer cloned.deinit(allocator);

    try std.testing.expectEqualStrings(db.driver, cloned.driver);
    try std.testing.expectEqualStrings(db.path.?, cloned.path.?);
}

test "config sections - logging config" {
    const allocator = std.testing.allocator;
    var logging = try config.LoggingConfig.init(allocator);
    defer logging.deinit(allocator);

    try std.testing.expectEqualStrings("info", logging.level);
    try std.testing.expectEqual(false, logging.json);

    var cloned = try logging.clone(allocator);
    defer cloned.deinit(allocator);

    try std.testing.expectEqualStrings(logging.level, cloned.level);
    try std.testing.expectEqual(logging.json, cloned.json);
}

test "config sections - cors config" {
    const allocator = std.testing.allocator;
    var cors = try config.CorsConfig.init(allocator);
    defer cors.deinit(allocator);

    try std.testing.expectEqual(@as(usize, 0), cors.allowed_origins.items.len);
    try std.testing.expectEqual(false, cors.allow_all_origins);

    var cloned = try cors.clone(allocator);
    defer cloned.deinit(allocator);

    try std.testing.expectEqual(cors.allowed_origins.items.len, cloned.allowed_origins.items.len);
    try std.testing.expectEqual(cors.allow_all_origins, cloned.allow_all_origins);
}

test "config sections - uploads config" {
    const allocator = std.testing.allocator;
    var uploads = try config.UploadsConfig.init(allocator);
    defer uploads.deinit(allocator);

    try std.testing.expectEqualStrings("./uploads", uploads.directory);

    var cloned = try uploads.clone(allocator);
    defer cloned.deinit(allocator);

    try std.testing.expectEqualStrings(uploads.directory, cloned.directory);
}

test "config sections - auto update config" {
    const allocator = std.testing.allocator;
    var au = try config.AutoUpdateConfig.init(allocator);
    defer au.deinit(allocator);

    try std.testing.expectEqual(false, au.enabled);
    try std.testing.expectEqual(false, au.check_enabled);
    try std.testing.expectEqual(@as(u32, 24), au.check_interval_hours);

    var cloned = try au.clone(allocator);
    defer cloned.deinit(allocator);

    try std.testing.expectEqual(au.enabled, cloned.enabled);
    try std.testing.expectEqual(au.check_enabled, cloned.check_enabled);
    try std.testing.expectEqual(au.check_interval_hours, cloned.check_interval_hours);
}

test "config sections - rate limit config" {
    const allocator = std.testing.allocator;
    var rl = try config.RateLimitConfig.init(allocator);
    defer rl.deinit(allocator);

    try std.testing.expectEqual(false, rl.enabled);
    try std.testing.expectEqual(true, rl.per_ip);
    try std.testing.expectEqual(true, rl.per_user);
    try std.testing.expectEqual(@as(u32, 100), rl.rate_per_sec);
    try std.testing.expectEqual(@as(u32, 200), rl.burst);
    try std.testing.expectEqual(@as(usize, 3), rl.exempt_paths.items.len);

    var cloned = try rl.clone(allocator);
    defer cloned.deinit(allocator);

    try std.testing.expectEqual(rl.enabled, cloned.enabled);
    try std.testing.expectEqual(rl.per_ip, cloned.per_ip);
    try std.testing.expectEqual(rl.per_user, cloned.per_user);
    try std.testing.expectEqual(rl.rate_per_sec, cloned.rate_per_sec);
    try std.testing.expectEqual(rl.burst, cloned.burst);
    try std.testing.expectEqual(rl.exempt_paths.items.len, cloned.exempt_paths.items.len);
}

test "config sections - auth config" {
    const allocator = std.testing.allocator;
    var auth = try config.AuthConfig.init(allocator);
    defer auth.deinit(allocator);

    try std.testing.expect(auth.jwt_pem == null);
    try std.testing.expect(auth.jwt_pem_path == null);
    try std.testing.expect(auth.jwt_secret == null);

    var cloned = try auth.clone(allocator);
    defer cloned.deinit(allocator);

    try std.testing.expect(cloned.jwt_pem == null);
    try std.testing.expect(cloned.jwt_pem_path == null);
    try std.testing.expect(cloned.jwt_secret == null);
}

test "writers - json format" {
    const allocator = std.testing.allocator;
    var cfg = try config.Config.init(allocator);
    defer cfg.deinit();

    // Create temp file
    const tmp_path = "test_config.json";
    defer std.fs.cwd().deleteFile(tmp_path) catch {};

    try writers.write_config(&cfg, "json", tmp_path);

    // Read and verify
    const file = try std.fs.cwd().openFile(tmp_path, .{});
    defer file.close();

    const content = try file.readToEndAlloc(allocator, 10 * 1024);
    defer allocator.free(content);

    try std.testing.expect(std.mem.indexOf(u8, content, "\"server\"") != null);
    try std.testing.expect(std.mem.indexOf(u8, content, "\"host\": \"0.0.0.0\"") != null);
    try std.testing.expect(std.mem.indexOf(u8, content, "\"port\": 6000") != null);
    try std.testing.expect(std.mem.indexOf(u8, content, "\"logging\"") != null);
    try std.testing.expect(std.mem.indexOf(u8, content, "\"database\"") != null);
}

test "writers - toml format" {
    const allocator = std.testing.allocator;
    var cfg = try config.Config.init(allocator);
    defer cfg.deinit();

    // Create temp file
    const tmp_path = "test_config.toml";
    defer std.fs.cwd().deleteFile(tmp_path) catch {};

    try writers.write_config(&cfg, "toml", tmp_path);

    // Read and verify
    const file = try std.fs.cwd().openFile(tmp_path, .{});
    defer file.close();

    const content = try file.readToEndAlloc(allocator, 10 * 1024);
    defer allocator.free(content);

    try std.testing.expect(std.mem.indexOf(u8, content, "[server]") != null);
    try std.testing.expect(std.mem.indexOf(u8, content, "host = \"0.0.0.0\"") != null);
    try std.testing.expect(std.mem.indexOf(u8, content, "port = 6000") != null);
    try std.testing.expect(std.mem.indexOf(u8, content, "[logging]") != null);
    try std.testing.expect(std.mem.indexOf(u8, content, "[database]") != null);
}

test "writers - yaml format" {
    const allocator = std.testing.allocator;
    var cfg = try config.Config.init(allocator);
    defer cfg.deinit();

    // Create temp file
    const tmp_path = "test_config.yaml";
    defer std.fs.cwd().deleteFile(tmp_path) catch {};

    try writers.write_config(&cfg, "yaml", tmp_path);

    // Read and verify
    const file = try std.fs.cwd().openFile(tmp_path, .{});
    defer file.close();

    const content = try file.readToEndAlloc(allocator, 10 * 1024);
    defer allocator.free(content);

    try std.testing.expect(std.mem.indexOf(u8, content, "server:") != null);
    try std.testing.expect(std.mem.indexOf(u8, content, "host: 0.0.0.0") != null);
    try std.testing.expect(std.mem.indexOf(u8, content, "port: 6000") != null);
    try std.testing.expect(std.mem.indexOf(u8, content, "logging:") != null);
    try std.testing.expect(std.mem.indexOf(u8, content, "database:") != null);
}

test "writers - invalid format" {
    const allocator = std.testing.allocator;
    var cfg = try config.Config.init(allocator);
    defer cfg.deinit();

    try std.testing.expectError(writers.GenError.InvalidFormat, writers.write_config(&cfg, "invalid", "test.txt"));
}

test "interactive - parse bool" {
    // Test various true values
    try std.testing.expectEqual(true, interactive.parseBool("true", false));
    try std.testing.expectEqual(true, interactive.parseBool("True", false));
    try std.testing.expectEqual(true, interactive.parseBool("t", false));
    try std.testing.expectEqual(true, interactive.parseBool("T", false));
    try std.testing.expectEqual(true, interactive.parseBool("yes", false));
    try std.testing.expectEqual(true, interactive.parseBool("Yes", false));
    try std.testing.expectEqual(true, interactive.parseBool("y", false));
    try std.testing.expectEqual(true, interactive.parseBool("Y", false));
    try std.testing.expectEqual(true, interactive.parseBool("1", false));

    // Test various false values
    try std.testing.expectEqual(false, interactive.parseBool("false", true));
    try std.testing.expectEqual(false, interactive.parseBool("False", true));
    try std.testing.expectEqual(false, interactive.parseBool("f", true));
    try std.testing.expectEqual(false, interactive.parseBool("F", true));
    try std.testing.expectEqual(false, interactive.parseBool("no", true));
    try std.testing.expectEqual(false, interactive.parseBool("No", true));
    try std.testing.expectEqual(false, interactive.parseBool("n", true));
    try std.testing.expectEqual(false, interactive.parseBool("N", true));
    try std.testing.expectEqual(false, interactive.parseBool("0", true));

    // Test empty string (should return default)
    try std.testing.expectEqual(true, interactive.parseBool("", true));
    try std.testing.expectEqual(false, interactive.parseBool("", false));
}

test "interactive - parse opt str" {
    // Test normal strings
    try std.testing.expectEqualStrings("hello", interactive.parseOptStr("hello").?);
    try std.testing.expectEqualStrings("world", interactive.parseOptStr("world").?);

    // Test empty string (should return null)
    try std.testing.expect(interactive.parseOptStr("") == null);

    // Test "none" (should return null)
    try std.testing.expect(interactive.parseOptStr("none") == null);
    try std.testing.expect(interactive.parseOptStr("None") == null);
    try std.testing.expect(interactive.parseOptStr("NONE") == null);
}

test "interactive - parse comma separated" {
    const allocator = std.testing.allocator;
    var list = std.ArrayList([]const u8).initCapacity(allocator, 0) catch unreachable;
    defer list.deinit(allocator);

    // Test normal comma separated
    try interactive.parseCommaSeparated(allocator, "a,b,c", &list);
    try std.testing.expectEqual(@as(usize, 3), list.items.len);
    try std.testing.expectEqualStrings("a", list.items[0]);
    try std.testing.expectEqualStrings("b", list.items[1]);
    try std.testing.expectEqualStrings("c", list.items[2]);

    // Test with spaces
    try interactive.parseCommaSeparated(allocator, " a , b , c ", &list);
    try std.testing.expectEqual(@as(usize, 3), list.items.len);
    try std.testing.expectEqualStrings("a", list.items[0]);
    try std.testing.expectEqualStrings("b", list.items[1]);
    try std.testing.expectEqualStrings("c", list.items[2]);

    // Test empty string
    try interactive.parseCommaSeparated(allocator, "", &list);
    try std.testing.expectEqual(@as(usize, 0), list.items.len);

    // Test single item
    try interactive.parseCommaSeparated(allocator, "single", &list);
    try std.testing.expectEqual(@as(usize, 1), list.items.len);
    try std.testing.expectEqualStrings("single", list.items[0]);
}

test "input key mapping - mapCharInput" {
    // Test basic character mappings
    var result = tui.mapCharInput('\n');
    try std.testing.expectEqual(tui.Key.enter, result.key);
    try std.testing.expectEqual(@as(?u8, null), result.char);

    result = tui.mapCharInput('\r');
    try std.testing.expectEqual(tui.Key.enter, result.key);

    result = tui.mapCharInput('\t');
    try std.testing.expectEqual(tui.Key.tab, result.key);

    result = tui.mapCharInput(127); // DEL
    try std.testing.expectEqual(tui.Key.backspace, result.key);

    result = tui.mapCharInput('\x08'); // BS
    try std.testing.expectEqual(tui.Key.backspace, result.key);

    // Test printable characters
    result = tui.mapCharInput('a');
    try std.testing.expectEqual(tui.Key.character, result.key);
    try std.testing.expectEqual(@as(?u8, 'a'), result.char);

    result = tui.mapCharInput('A');
    try std.testing.expectEqual(tui.Key.character, result.key);
    try std.testing.expectEqual(@as(?u8, 'A'), result.char);

    // Test non-printable characters (should be unknown)
    result = tui.mapCharInput('\x1b'); // ESC - handled in readKeyUnix, so unknown here
    try std.testing.expectEqual(tui.Key.unknown, result.key);
    try std.testing.expectEqual(@as(?u8, null), result.char);

    result = tui.mapCharInput(0);
    try std.testing.expectEqual(tui.Key.unknown, result.key);
}

test "input key mapping - mapNavChar" {
    // Test navigation character mappings
    var result = tui.mapNavChar('w');
    try std.testing.expectEqual(tui.Key.up, result.key);

    result = tui.mapNavChar('s');
    try std.testing.expectEqual(tui.Key.down, result.key);

    result = tui.mapNavChar('a');
    try std.testing.expectEqual(tui.Key.left, result.key);

    result = tui.mapNavChar('d');
    try std.testing.expectEqual(tui.Key.right, result.key);

    result = tui.mapNavChar('q');
    try std.testing.expectEqual(tui.Key.escape, result.key);

    // Case insensitive
    result = tui.mapNavChar('W');
    try std.testing.expectEqual(tui.Key.up, result.key);

    // Unknown chars
    result = tui.mapNavChar('x');
    try std.testing.expectEqual(tui.Key.unknown, result.key);
}

test "input key mapping - mapKeyInput" {
    // Test Windows virtual key mappings
    var result = tui.mapKeyInput(0x0D, 0); // VK_RETURN
    try std.testing.expectEqual(tui.Key.enter, result.key);

    result = tui.mapKeyInput(0x1B, 0); // VK_ESCAPE
    try std.testing.expectEqual(tui.Key.escape, result.key);

    result = tui.mapKeyInput(0x09, 0); // VK_TAB
    try std.testing.expectEqual(tui.Key.tab, result.key);

    result = tui.mapKeyInput(0x08, 0); // VK_BACK
    try std.testing.expectEqual(tui.Key.backspace, result.key);

    result = tui.mapKeyInput(0x26, 0); // VK_UP
    try std.testing.expectEqual(tui.Key.up, result.key);

    result = tui.mapKeyInput(0x28, 0); // VK_DOWN
    try std.testing.expectEqual(tui.Key.down, result.key);

    result = tui.mapKeyInput(0x25, 0); // VK_LEFT
    try std.testing.expectEqual(tui.Key.left, result.key);

    result = tui.mapKeyInput(0x27, 0); // VK_RIGHT
    try std.testing.expectEqual(tui.Key.right, result.key);

    // Test character input
    result = tui.mapKeyInput(0x00, 'a');
    try std.testing.expectEqual(tui.Key.character, result.key);
    try std.testing.expectEqual(@as(?u8, 'a'), result.char);

    // Test unknown key
    result = tui.mapKeyInput(0x00, 0);
    try std.testing.expectEqual(tui.Key.unknown, result.key);
}

test "config with modified values" {
    const allocator = std.testing.allocator;
    var cfg = try config.Config.init(allocator);
    defer cfg.deinit();

    // Modify some values
    allocator.free(cfg.server.host);
    cfg.server.host = try allocator.dupe(u8, "127.0.0.1");
    cfg.server.port = 8080;

    allocator.free(cfg.logging.level);
    cfg.logging.level = try allocator.dupe(u8, "debug");
    cfg.logging.json = true;

    // Test the modified values
    try std.testing.expectEqualStrings("127.0.0.1", cfg.server.host);
    try std.testing.expectEqual(@as(u16, 8080), cfg.server.port);
    try std.testing.expectEqualStrings("debug", cfg.logging.level);
    try std.testing.expectEqual(true, cfg.logging.json);
}

test "database config - sqlite vs non-sqlite" {
    const allocator = std.testing.allocator;
    var db = try config.DatabaseConfig.init(allocator);
    defer db.deinit(allocator);

    // Should be sqlite by default
    try std.testing.expect(db.isSqlite());

    // Change to postgres
    allocator.free(db.driver);
    db.driver = try allocator.dupe(u8, "postgres");
    try std.testing.expect(!db.isSqlite());

    // Change back to sqlite
    allocator.free(db.driver);
    db.driver = try allocator.dupe(u8, "sqlite");
    try std.testing.expect(db.isSqlite());
}

test "writers - custom config values" {
    const allocator = std.testing.allocator;
    var cfg = try config.Config.init(allocator);
    defer cfg.deinit();

    // Modify some values
    allocator.free(cfg.server.host);
    cfg.server.host = try allocator.dupe(u8, "127.0.0.1");
    cfg.server.port = 8080;

    // Create temp file
    const tmp_path = "test_custom_config.toml";
    defer std.fs.cwd().deleteFile(tmp_path) catch {};

    try writers.write_config(&cfg, "toml", tmp_path);

    // Read and verify custom values
    const file = try std.fs.cwd().openFile(tmp_path, .{});
    defer file.close();

    const content = try file.readToEndAlloc(allocator, 10 * 1024);
    defer allocator.free(content);

    try std.testing.expect(std.mem.indexOf(u8, content, "host = \"127.0.0.1\"") != null);
    try std.testing.expect(std.mem.indexOf(u8, content, "port = 8080") != null);
}

test "config sections - cors with origins" {
    const allocator = std.testing.allocator;
    var cors = try config.CorsConfig.init(allocator);
    defer cors.deinit(allocator);

    // Add some origins (duplicate them since cors.deinit will try to free them)
    try cors.allowed_origins.append(allocator, try allocator.dupe(u8, "http://localhost:3000"));
    try cors.allowed_origins.append(allocator, try allocator.dupe(u8, "https://example.com"));

    try std.testing.expectEqual(@as(usize, 2), cors.allowed_origins.items.len);
    try std.testing.expectEqualStrings("http://localhost:3000", cors.allowed_origins.items[0]);
    try std.testing.expectEqualStrings("https://example.com", cors.allowed_origins.items[1]);

    var cloned = try cors.clone(allocator);
    defer cloned.deinit(allocator);

    try std.testing.expectEqual(cors.allowed_origins.items.len, cloned.allowed_origins.items.len);
    try std.testing.expectEqualStrings(cors.allowed_origins.items[0], cloned.allowed_origins.items[0]);
}

test "config sections - rate limit with exempt paths" {
    const allocator = std.testing.allocator;
    var rl = try config.RateLimitConfig.init(allocator);
    defer rl.deinit(allocator);

    // Should have default exempt paths
    try std.testing.expectEqual(@as(usize, 3), rl.exempt_paths.items.len);
    try std.testing.expectEqualStrings("/health", rl.exempt_paths.items[0]);
    try std.testing.expectEqualStrings("/ready", rl.exempt_paths.items[1]);
    try std.testing.expectEqualStrings("/csrf-token", rl.exempt_paths.items[2]);
}

test "interactive - edge cases" {
    // Test parseBool with invalid inputs (should return false for non-matching inputs)
    try std.testing.expectEqual(false, interactive.parseBool("invalid", false));
    try std.testing.expectEqual(false, interactive.parseBool("invalid", true));

    // Test parseOptStr with various cases
    try std.testing.expect(interactive.parseOptStr("NONE") == null);
    try std.testing.expect(interactive.parseOptStr("None") == null);
    try std.testing.expectEqualStrings("value", interactive.parseOptStr("value").?);
}
