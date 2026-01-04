// src/Navbar.jsx
import React from 'react';
import { BellIcon, AdjustmentsHorizontalIcon, EnvelopeIcon } from '@heroicons/react/24/outline';

const Navbar = () => {
  return (
    <nav className="bg-white shadow-md p-4 flex items-center justify-between">
      {/* Institution Name */}
      <div className="flex items-center">
        <p className="text-sm font-semibold text-gray-700">
          KUMARAGURU COLLEGE OF TECHNOLOGY (AUTONOMOUS)
        </p>
      </div>

      {/* Right Side Icons & Profile */}
      <div className="flex items-center space-x-6">
        {/* Flash News */}
        <div className="relative">
          <span className="absolute top-0 right-0 h-2 w-2 bg-red-500 rounded-full animate-pulse"></span>
          <span className="font-semibold text-blue-700">Flash News</span>
        </div>

        {/* Icons */}
        <div className="flex items-center space-x-4">
          <EnvelopeIcon className="h-6 w-6 text-gray-600 cursor-pointer" />
          <BellIcon className="h-6 w-6 text-gray-600 cursor-pointer" />
          <AdjustmentsHorizontalIcon className="h-6 w-6 text-gray-600 cursor-pointer" />
        </div>

        {/* User Profile */}
        <div className="flex items-center space-x-2 border-l pl-4 border-gray-200">
          <img 
            src="https://via.placeholder.com/40" // Placeholder for user image
            alt="User Profile" 
            className="h-10 w-10 rounded-full object-cover" 
          />
          <div>
            <p className="text-sm font-semibold">MOHAMED FAIZAL N</p>
            <p className="text-xs text-gray-500">STUDENTS</p>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;