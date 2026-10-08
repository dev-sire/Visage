import { createContext, useContext, useEffect, useState } from "react";
import { resolveImageUrl } from "@/lib/utils";
import { IUser } from "@/types";
import {
  AuthFailureReason,
  AuthStageError,
  errorMessage,
  getCurrentUser,
} from "@/lib/appwrite/api";

export const INITIAL_USER = {
  id: "",
  name: "",
  username: "",
  email: "",
  imageUrl: "",
  bio: "",
};

export type AuthCheckResult =
  | { ok: true }
  | { ok: false; reason: AuthFailureReason; message: string };

const INITIAL_STATE = {
  user: INITIAL_USER,
  isLoading: true,
  isAuthenticated: false,
  setUser: () => {},
  setIsAuthenticated: () => {},
  checkAuthUser: async () =>
    ({ ok: false, reason: "error", message: "AuthProvider is missing" }) as AuthCheckResult,
};

type IContextType = {
  user: IUser;
  isLoading: boolean;
  setUser: React.Dispatch<React.SetStateAction<IUser>>;
  isAuthenticated: boolean;
  setIsAuthenticated: React.Dispatch<React.SetStateAction<boolean>>;
  checkAuthUser: () => Promise<AuthCheckResult>;
};

const AuthContext = createContext<IContextType>(INITIAL_STATE);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<IUser>(INITIAL_USER);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  // True until the first session check on page load has finished, so private
  // routes can wait instead of flashing or redirecting too early.
  const [isLoading, setIsLoading] = useState(true);

  const checkAuthUser = async (): Promise<AuthCheckResult> => {
    setIsLoading(true);
    try {
      const currentUser = await getCurrentUser();
      setUser({
        id: currentUser.$id,
        name: currentUser.name,
        username: currentUser.username,
        email: currentUser.email,
        imageUrl: resolveImageUrl(currentUser.imageURL),
        bio: currentUser.bio,
      });
      setIsAuthenticated(true);

      return { ok: true };
    } catch (error) {
      setUser(INITIAL_USER);
      setIsAuthenticated(false);

      if (error instanceof AuthStageError) {
        return { ok: false, reason: error.reason, message: error.message };
      }
      return { ok: false, reason: "error", message: errorMessage(error) };
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // A guest legitimately gets a 401 here; RootLayout redirects them to /sign-in.
    checkAuthUser();
  }, []);

  const value = {
    user,
    setUser,
    isLoading,
    isAuthenticated,
    setIsAuthenticated,
    checkAuthUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useUserContext = () => useContext(AuthContext);