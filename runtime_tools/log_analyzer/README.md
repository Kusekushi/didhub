# DIDHub Log Analyzer

A fast, cross-platform log analysis tool written in Zig for the DIDAlterHub project.

## Features

- **Fast Parsing**: Efficiently parses log files with timestamp, level, and message extraction
- **Interactive TUI**: Terminal-based user interface with scrolling, searching, and filtering
- **Colored Output**: Color-coded log levels for easy visual scanning
- **Statistics**: Provides summary statistics including error counts and time ranges
- **Cross-platform**: Works on Windows, Linux, and macOS

## Usage

### Command Line Interface

```bash
# Analyze a log file and show statistics
./didhub-log-analyzer analyze --input path/to/logfile.log

# Display logs in interactive TUI
./didhub-log-analyzer tui --input path/to/logfile.log
```

### Log Format

The analyzer expects logs in the following format:
```
YYYY-MM-DD HH:MM:SS [LEVEL] Message
```

Example:
```
2024-01-01 10:00:00 [Info] Application started
2024-01-01 10:00:01 [Debug] Loading configuration
2024-01-01 10:00:02 [Error] Failed to connect to database
```

Supported log levels: `Info`, `Debug`, `Warn`, `Error`

### TUI Commands

When in TUI mode:

- `q` - Quit the application
- `j` / `k` - Scroll down/up through logs
- `/` - Enter search mode (type a search term and press Enter)
- `f` - Filter by log level (prompts for level: info, debug, warn, error)

### Building

```bash
cd runtime_tools/log_analyzer
zig build
```

The executable will be in `zig-out/bin/didhub-log-analyzer.exe` (Windows) or `zig-out/bin/didhub-log-analyzer` (Linux/macOS).

## Examples

```bash
# Analyze backend logs
./didhub-log-analyzer analyze --input ../../backend/target/test-logs/app.log

# Interactive analysis of error logs
./didhub-log-analyzer tui --input error.log
```

## Development

Built with Zig 0.15. Uses standard library for parsing and TUI functionality. Windows ANSI support is enabled automatically for colored output.