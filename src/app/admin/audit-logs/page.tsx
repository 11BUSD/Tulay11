import { AuditLogsView } from "@/components/admin/AuditLogsView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function AdminAuditLogsPage() {
  return <AuditLogsView />;
}
