import React, { createContext, useContext, useState } from "react";

const AcademicSessionContext = createContext(null);

export const useAcademicSession = () => {
  const ctx = useContext(AcademicSessionContext);
  return ctx;
};

const currentYear = new Date().getFullYear();
const defaultAY = `${currentYear}-${currentYear + 1}`;

export const AcademicSessionProvider = ({ children }) => {
  const [ay, setAy] = useState(defaultAY);
  const [semester, setSemester] = useState("EVEN");
  const [category, setCategory] = useState("CAT I");
  return (
    <AcademicSessionContext.Provider
      value={{
        ay,
        setAy,
        semester,
        setSemester,
        category,
        setCategory,
      }}
    >
      {children}
    </AcademicSessionContext.Provider>
  );
};
