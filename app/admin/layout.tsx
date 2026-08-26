import { AppSidebar } from "@/app/admin/app-sidebar";
import { AdminTopbar } from "@/app/admin/admin-topbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { requirePageAdmin } from "@/lib/authorization";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const context = await requirePageAdmin();

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar userName={context.session.user.name} />
        <SidebarInset>
          <AdminTopbar />
          {children}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
