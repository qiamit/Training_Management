import { redirect } from "next/navigation";

export default async function EmployeeDashboardPage() {
  redirect("/dashboard/individual");
}
