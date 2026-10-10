import type { Metadata } from "next";
import { ChatApp } from "@/components/chat/chat-app";

export const metadata: Metadata = { title: "Chat · Cellar & Co. Support" };

export default function ChatPage() {
  return <ChatApp />;
}
