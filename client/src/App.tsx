import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import NotFound from "@/pages/not-found";
import LiveDesk from "@/pages/live-desk";
import AuthPage from "@/pages/auth";
import Portal from "@/pages/portal";
import AdminPortal from "@/pages/admin-portal";

function Router() {
  return (
    <Switch>
      <Route path="/" component={LiveDesk} />
      <Route path="/live-desk" component={LiveDesk} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/login" component={AuthPage} />
      <Route path="/register" component={AuthPage} />
      <Route path="/portal" component={Portal} />
      <Route path="/admin" component={AdminPortal} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
