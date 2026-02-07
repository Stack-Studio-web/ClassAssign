import React from "react";
import Sidebar from "./Sidebar";

const Layout = ({ children }) => {
  return (
    <div className="flex min-h-screen bg-gray-50">
      
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <main
        className="
          flex-1
          pt-8 pb-8
          pl-0
          lg:pl-64
          transition-all duration-300
        "
      >
        <div className="px-4 lg:px-8 max-w-full">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
