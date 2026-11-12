import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Suppress removeChild errors caused by browser extensions (password managers, etc.)
// modifying DOM nodes that React is trying to unmount
const originalRemoveChild = Node.prototype.removeChild;
Node.prototype.removeChild = function <T extends Node>(child: T): T {
  if (child.parentNode !== this) {
    if (console && console.warn) {
      console.warn("Cannot remove child: not a child of this node", child);
    }
    return child;
  }
  return originalRemoveChild.call(this, child) as T;
};

createRoot(document.getElementById("root")!).render(<App />);
