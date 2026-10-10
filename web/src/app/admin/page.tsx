import type { Metadata } from "next";
import { AdminApp } from "@/components/admin/admin-app";

export const metadata: Metadata = { title: "Admin · Cellar & Co. Support" };

export default function AdminPage() {
  return <AdminApp />;
}
