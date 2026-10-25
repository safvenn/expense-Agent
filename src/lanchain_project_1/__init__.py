"""Command-line launcher for Expense Assistant from a source checkout."""

import argparse
from pathlib import Path


def main() -> None:
    """Start the FastAPI server with explicit local-development defaults."""
    parser = argparse.ArgumentParser(description="Run the Expense Assistant API and web interface.")
    parser.add_argument("--host", default="127.0.0.1", help="Bind address (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="Port (default: 8000)")
    parser.add_argument("--reload", action="store_true", help="Reload when source files change")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")

    root = Path(__file__).resolve().parents[2]
    if not (root / "app" / "main.py").is_file():
        root = Path.cwd()
    if not (root / "app" / "main.py").is_file():
        parser.error("Run this command from the Expense Assistant repository root.")

    import uvicorn

    uvicorn.run(
        "app.main:app",
        app_dir=str(root),
        host=args.host,
        port=args.port,
        reload=args.reload,
        reload_dirs=[str(root / "app")] if args.reload else None,
    )
