import { ArrowLeft, Home } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AenderungswunschKnopf } from "@/components/aenderungswunsch";

interface PageHeaderProps {
  title?: string;
  showBackButton?: boolean;
  backPath?: string;
}

export function PageHeader({ title, showBackButton = true, backPath }: PageHeaderProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (backPath) {
      navigate(backPath);
    } else {
      navigate(-1);
    }
  };

  return (
    // data-seitenkopf: der schwebende Melde-Knopf blendet sich aus, sobald
    // eine echte Kopfzeile da ist - sonst erschiene er doppelt.
    <header data-seitenkopf className="border-b bg-card sticky top-0 z-50 shadow-sm">
      <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
        <div className="flex items-center gap-2 sm:gap-4">
          {showBackButton && (
            <Button variant="ghost" size="sm" onClick={handleBack} data-bildschirmfoto="aus">
              <ArrowLeft className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Zurück</span>
            </Button>
          )}
          {/* Ausdruecklicher Weg zur Startseite. Das Logo fuehrt zwar auch
              dorthin, sieht aber nicht nach einem Knopf aus - besonders am
              Handy (Kundenwunsch Franz, 10.09.2026). */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            title="Zur Startseite"
            aria-label="Zur Startseite"
            data-bildschirmfoto="aus"
          >
            <Home className="h-4 w-4" />
          </Button>
          <img
            src="/schafferhofer-logo.png"
            alt="Schafferhofer Bau"
            className="h-14 sm:h-20 w-auto max-w-[180px] sm:max-w-[240px] cursor-pointer hover:opacity-80 transition-opacity object-contain"
            onClick={() => navigate("/")}
          />
          {title && (
            <h1 className="text-lg sm:text-2xl font-bold truncate">{title}</h1>
          )}
          <div className="ml-auto shrink-0">
            <AenderungswunschKnopf gestalt="kopf" />
          </div>
        </div>
      </div>
    </header>
  );
}
