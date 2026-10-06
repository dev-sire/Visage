import Bottombar from "@/components/shared/Bottombar"
import LeftSidebar from "@/components/shared/LeftSidebar"
import Topbar from "@/components/shared/Topbar"
import Loader from "@/components/shared/Loader"
import { useUserContext } from "@/context/AuthContext"
import { Navigate, Outlet } from "react-router-dom"

const RootLayout = () => {
  const { isAuthenticated, isLoading } = useUserContext();

  // Wait for the initial session check before deciding anything.
  if (isLoading) {
    return (
      <div className="flex-center w-full h-screen">
        <Loader />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/sign-in" replace />;

  return (
    <div className="w-full md:flex">
      <Topbar />
      <LeftSidebar />

      <section className="flex flex-1 h-full">
        <Outlet />
      </section>
      <Bottombar/>
    </div>
  )
}

export default RootLayout