const std = @import("std");

pub const MaybeStr = ?[]const u8;

// Import all config sections
pub const ServerConfig = @import("config/server.zig").ServerConfig;
pub const LoggingConfig = @import("config/logging.zig").LoggingConfig;
pub const CorsConfig = @import("config/cors.zig").CorsConfig;
pub const DatabaseConfig = @import("config/database.zig").DatabaseConfig;
pub const UploadsConfig = @import("config/uploads.zig").UploadsConfig;
pub const AutoUpdateConfig = @import("config/autoupdate.zig").AutoUpdateConfig;
pub const RateLimitConfig = @import("config/ratelimit.zig").RateLimitConfig;
pub const AuthConfig = @import("config/auth.zig").AuthConfig;

/// Main configuration structure
pub const Config = struct {
    allocator: std.mem.Allocator,
    server: ServerConfig,
    logging: LoggingConfig,
    cors: CorsConfig,
    redis_url: MaybeStr,
    database: DatabaseConfig,
    uploads: UploadsConfig,
    auto_update: AutoUpdateConfig,
    rate_limit: RateLimitConfig,
    auth: AuthConfig,

    pub fn init(allocator: std.mem.Allocator) !Config {
        return Config{
            .allocator = allocator,
            .server = try ServerConfig.init(allocator),
            .logging = try LoggingConfig.init(allocator),
            .cors = try CorsConfig.init(allocator),
            .redis_url = null,
            .database = try DatabaseConfig.init(allocator),
            .uploads = try UploadsConfig.init(allocator),
            .auto_update = try AutoUpdateConfig.init(allocator),
            .rate_limit = try RateLimitConfig.init(allocator),
            .auth = try AuthConfig.init(allocator),
        };
    }

    pub fn deinit(self: *Config) void {
        self.server.deinit(self.allocator);
        self.logging.deinit(self.allocator);
        self.cors.deinit(self.allocator);
        self.database.deinit(self.allocator);
        self.uploads.deinit(self.allocator);
        self.auto_update.deinit(self.allocator);
        self.rate_limit.deinit(self.allocator);
        self.auth.deinit(self.allocator);

        if (self.redis_url) |url| {
            self.allocator.free(url);
        }
    }

    pub fn clone(self: Config) !Config {
        const cloned = Config{
            .allocator = self.allocator,
            .server = try self.server.clone(self.allocator),
            .logging = try self.logging.clone(self.allocator),
            .cors = try self.cors.clone(self.allocator),
            .redis_url = if (self.redis_url) |url| try self.allocator.dupe(u8, url) else null,
            .database = try self.database.clone(self.allocator),
            .uploads = try self.uploads.clone(self.allocator),
            .auto_update = try self.auto_update.clone(self.allocator),
            .rate_limit = try self.rate_limit.clone(self.allocator),
            .auth = try self.auth.clone(self.allocator),
        };
        return cloned;
    }
};

// Legacy alias for backward compatibility
pub const DefaultConfig = Config;
