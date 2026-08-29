"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HistoryIcon, HouseIcon, LayoutDashboardIcon, PhoneCallIcon, ScrollTextIcon, TicketIcon, UsersIcon } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

const navigation = [
  { title: "Overview", href: "/admin", icon: LayoutDashboardIcon },
  { title: "Households", href: "/admin/households", icon: HouseIcon },
  { title: "People", href: "/admin/people", icon: UsersIcon },
  { title: "Visitors", href: "/admin/visitors", icon: TicketIcon },
  { title: "Access activity", href: "/admin/access", icon: HistoryIcon },
  { title: "Phone calls", href: "/admin/calls", icon: PhoneCallIcon },
  { title: "Activity log", href: "/admin/activity", icon: ScrollTextIcon },
];

const gateyVersion = process.env.NEXT_PUBLIC_GATEY_VERSION || "dev";

export function AppSidebar({ userName, ...props }: React.ComponentProps<typeof Sidebar> & { userName: string }) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="Gatey admin" render={<Link href="/admin" />}>
              <span className="flex aspect-square size-8 items-center justify-center overflow-hidden rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Image src="/gatey-logo.png" alt="" width={32} height={32} className="size-8 object-cover" />
              </span>
              <span className="flex min-w-0 flex-col leading-none">
                <span className="font-semibold">Gatey</span>
                <span className="mt-1 text-xs text-sidebar-foreground/65">Administration</span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Manage</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => {
                const active = item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton isActive={active} tooltip={item.title} render={<Link href={item.href} />}>
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Resident view" render={<Link href="/" />}>
              <HouseIcon />
              <span className="min-w-0"><span className="block truncate">Resident view</span><span className="block truncate text-xs text-sidebar-foreground/60">{userName}</span></span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <p className="px-2 text-[10px] font-medium tracking-wide text-sidebar-foreground/45 group-data-[collapsible=icon]:hidden">Version {gateyVersion}</p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
