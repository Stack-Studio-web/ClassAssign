import React, { createContext, useContext, useState } from "react";

const SidebarContext = createContext(null);

export const useSidebar = () => {
  const ctx = useContext(SidebarContext);
  return ctx;
};

export const SidebarProvider = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed, mobileMenuOpen, setMobileMenuOpen }}>
      {children}
    </SidebarContext.Provider>
  );
};
