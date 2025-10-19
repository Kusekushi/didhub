const std = @import("std");

/// Database configuration section
pub const DatabaseConfig = struct {
    driver: []const u8,
    path: ?[]const u8,
    host: ?[]const u8,
    port: ?u16,
    database: ?[]const u8,
    username: ?[]const u8,
    password: ?[]const u8,
    ssl_mode: ?[]const u8,

    pub const default = DatabaseConfig{
        .driver = "sqlite",
        .path = "didhub.sqlite",
        .host = null,
        .port = null,
        .database = null,
        .username = null,
        .password = null,
        .ssl_mode = null,
    };

    pub fn init(allocator: std.mem.Allocator) !DatabaseConfig {
        _ = allocator; // Not used for now
        return default;
    }

    pub fn deinit(self: *DatabaseConfig) void {
        _ = self; // No dynamic allocation yet
    }

    pub fn clone(self: DatabaseConfig, allocator: std.mem.Allocator) !DatabaseConfig {
        return DatabaseConfig{
            .driver = try allocator.dupe(u8, self.driver),
            .path = if (self.path) |value| try allocator.dupe(u8, value) else null,
            .host = if (self.host) |value| try allocator.dupe(u8, value) else null,
            .port = self.port,
            .database = if (self.database) |value| try allocator.dupe(u8, value) else null,
            .username = if (self.username) |value| try allocator.dupe(u8, value) else null,
            .password = if (self.password) |value| try allocator.dupe(u8, value) else null,
            .ssl_mode = if (self.ssl_mode) |value| try allocator.dupe(u8, value) else null,
        };
    }

    pub fn isSqlite(self: DatabaseConfig) bool {
        return std.mem.eql(u8, self.driver, "sqlite");
    }
};
