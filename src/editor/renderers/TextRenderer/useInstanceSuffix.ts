import { useRef } from "react";

let _instanceCounter = 0;

export function useInstanceSuffix(): string {
  const idRef = useRef("");
  if (!idRef.current) {
    _instanceCounter++;
    idRef.current = String(_instanceCounter);
  }
  return idRef.current;
}