const std = @import("std");

/// Server configuration section
pub const ServerConfig = struct {
    host: []const u8,
    port: u16,

    pub const default = ServerConfig{
        .host = "0.0.0.0",
        .port = 6000,
    };

    pub fn init(allocator: std.mem.Allocator) !ServerConfig {
        return ServerConfig{
            .host = try allocator.dupe(u8, "0.0.0.0"),
            .port = 6000,
        };
    }

    pub fn deinit(self: *ServerConfig, allocator: std.mem.Allocator) void {
        allocator.free(self.host);
    }

    pub fn clone(self: ServerConfig, allocator: std.mem.Allocator) !ServerConfig {
        return ServerConfig{
            .host = try allocator.dupe(u8, self.host),
            .port = self.port,
        };
    }
};
