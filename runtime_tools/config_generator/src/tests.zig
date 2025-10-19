const std = @import("std");
const config = @import("config.zig");

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
