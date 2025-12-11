const std = @import("std");

/// CORS configuration section
pub const CorsConfig = struct {
    allowed_origins: std.ArrayList([]const u8),
    allow_all_origins: bool,

    pub const default = CorsConfig{
        .allowed_origins = undefined, // Must be initialized with allocator
        .allow_all_origins = false,
    };

    pub fn init(allocator: std.mem.Allocator) !CorsConfig {
        const allowed_origins = std.ArrayList([]const u8).initCapacity(allocator, 0) catch return error.OutOfMemory;
        return CorsConfig{
            .allowed_origins = allowed_origins,
            .allow_all_origins = false,
        };
    }

    pub fn deinit(self: *CorsConfig, allocator: std.mem.Allocator) void {
        for (self.allowed_origins.items) |origin| {
            allocator.free(origin);
        }
        self.allowed_origins.deinit(allocator);
    }

    pub fn clone(self: CorsConfig, allocator: std.mem.Allocator) !CorsConfig {
        var allowed_origins = std.ArrayList([]const u8).initCapacity(allocator, self.allowed_origins.items.len) catch return error.OutOfMemory;
        for (self.allowed_origins.items) |origin| {
            const cloned = try allocator.dupe(u8, origin);
            allowed_origins.appendAssumeCapacity(cloned);
        }

        return CorsConfig{
            .allowed_origins = allowed_origins,
            .allow_all_origins = self.allow_all_origins,
        };
    }
};
