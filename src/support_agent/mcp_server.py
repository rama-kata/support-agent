"""Expose the store tools over MCP (stdio), for Claude Desktop, Cursor or any MCP client.

The MCP session is bound to one customer at startup, mirroring how the web API binds the
customer from the auth token: clients can't pass a customer id per call.

    uv run support-agent-mcp --customer 1
"""

import argparse
import inspect
import logging

from langchain_core.tools import BaseTool
from mcp.server.mcpserver import MCPServer

from support_agent.tools import TOOLS


def _wrap(tool: BaseTool, config: dict):
    """A plain function with the tool's typed signature (minus the injected config)."""
    fields = tool.tool_call_schema.model_fields

    def handler(**kwargs) -> str:
        return tool.invoke(kwargs, config=config)

    handler.__name__ = tool.name
    handler.__signature__ = inspect.Signature([
        inspect.Parameter(name, inspect.Parameter.KEYWORD_ONLY, annotation=f.annotation,
                          default=inspect.Parameter.empty if f.is_required() else f.default)
        for name, f in fields.items()
    ])
    handler.__annotations__ = {name: f.annotation for name, f in fields.items()} | {
        "return": str}
    return handler


def build_server(customer_id: int) -> MCPServer:
    server = MCPServer("cellar-and-co-support")
    config = {"configurable": {"customer_id": customer_id}}
    for tool in TOOLS:
        server.add_tool(_wrap(tool, config), name=tool.name, description=tool.description)
    return server


def main():
    parser = argparse.ArgumentParser(description="Cellar & Co. support tools over MCP")
    parser.add_argument("--customer", type=int, required=True)
    args = parser.parse_args()
    # stdout carries the MCP protocol; keep library chatter off it and quiet on stderr.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    build_server(args.customer).run()


if __name__ == "__main__":
    main()
