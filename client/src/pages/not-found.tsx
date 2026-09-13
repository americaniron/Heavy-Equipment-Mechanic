import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#111]">
      <Card className="w-full max-w-md mx-4 bg-[#1a1a1a] border-[#333]">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-white">Page not found</h1>
          </div>

          <p className="mt-4 text-sm text-gray-400">
            The page you requested does not exist or may have moved.
          </p>
          <Button asChild className="mt-6 bg-[#FFCD11] text-black">
            <a href="/" data-testid="link-not-found-home"><ArrowLeft className="mr-2 h-4 w-4" /> Back to FixMyIron</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
