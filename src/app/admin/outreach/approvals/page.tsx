import { ApprovalQueue } from "@/components/admin/ApprovalQueue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function AdminApprovalsPage() {
  return <ApprovalQueue />;
}
