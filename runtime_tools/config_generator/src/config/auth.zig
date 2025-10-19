const std = @import("std");

/// Authentication configuration section
pub const AuthConfig = struct {
    jwt_pem: ?[]const u8,
    jwt_pem_path: ?[]const u8,
    jwt_secret: ?[]const u8,

    pub const default = AuthConfig{
        .jwt_pem = null,
        .jwt_pem_path = null,
        .jwt_secret = null,
    };

    pub fn init(allocator: std.mem.Allocator) !AuthConfig {
        _ = allocator; // Not used for now
        return default;
    }

    pub fn deinit(self: *AuthConfig) void {
        _ = self; // No dynamic allocation yet
    }

    pub fn clone(self: AuthConfig, allocator: std.mem.Allocator) !AuthConfig {
        return AuthConfig{
            .jwt_pem = if (self.jwt_pem) |value| try allocator.dupe(u8, value) else null,
            .jwt_pem_path = if (self.jwt_pem_path) |value| try allocator.dupe(u8, value) else null,
            .jwt_secret = if (self.jwt_secret) |value| try allocator.dupe(u8, value) else null,
        };
    }
};
