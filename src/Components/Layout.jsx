import React from "react";
import Sidebar from "./Sidebar";
import DashboardNavbar from "./DashboardNavbar";
import { SidebarProvider, useSidebar } from "../context/SidebarContext";
import { AcademicSessionProvider } from "../context/AcademicSessionContext";

const LayoutMain = ({ children }) => {
  const { collapsed } = useSidebar();
  return (
    <main
      className={`
        flex-1 min-h-screen flex flex-col pl-0
        border-l border-gray-200/80
        transition-[padding] duration-300 ease-in-out
        ${collapsed ? "lg:pl-20" : "lg:pl-64"}
      `}
    >
      <div className="flex-1 pt-4 md:pt-6 pb-6 md:pb-8 pl-3 pr-3 md:pl-5 md:pr-6 lg:pl-6 lg:pr-8 max-w-full overflow-auto">
        {children}
      </div>
    </main>
  );
};

const Layout = ({ children }) => {
  return (
    <SidebarProvider>
      <AcademicSessionProvider>
        <div className="flex min-h-screen flex-col bg-gray-50">
          <DashboardNavbar />
          <div className="flex flex-1 pt-14 min-h-0">
            <Sidebar />
            <LayoutMain>{children}</LayoutMain>
          </div>
        </div>
      </AcademicSessionProvider>
    </SidebarProvider>
  );
};

export default Layout;
