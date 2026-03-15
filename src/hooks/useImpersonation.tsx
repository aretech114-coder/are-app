import { createContext, useContext, useState, ReactNode } from "react";

interface ImpersonatedUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

interface ImpersonationContext {
  impersonatedUser: ImpersonatedUser | null;
  startImpersonation: (user: ImpersonatedUser) => void;
  stopImpersonation: () => void;
  isImpersonating: boolean;
}

const ImpersonationContext = createContext<ImpersonationContext>({
  impersonatedUser: null,
  startImpersonation: () => {},
  stopImpersonation: () => {},
  isImpersonating: false,
});

export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const [impersonatedUser, setImpersonatedUser] = useState<ImpersonatedUser | null>(null);

  const startImpersonation = (user: ImpersonatedUser) => {
    setImpersonatedUser(user);
  };

  const stopImpersonation = () => {
    setImpersonatedUser(null);
  };

  return (
    <ImpersonationContext.Provider
      value={{
        impersonatedUser,
        startImpersonation,
        stopImpersonation,
        isImpersonating: !!impersonatedUser,
      }}
    >
      {children}
    </ImpersonationContext.Provider>
  );
}

export const useImpersonation = () => useContext(ImpersonationContext);
