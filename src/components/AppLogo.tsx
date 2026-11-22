interface AppLogoProps {
  className?: string;
}

export default function AppLogo({ className = "h-10 w-10" }: AppLogoProps) {
  return <img src="/smartscan-logo.svg" alt="SmartScan Attendance" className={className} />;
}
