import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useRef, useEffect, useCallback } from "react";

interface CalibrationProps {
  direction: "horizontal" | "vertical";
  length: number;
  offset?: number;
}

export function Calibration({ direction, length, offset = 0 }: CalibrationProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const generateMarks = useCallback(() => {
    const marks: JSX.Element[] = [];
    const step = 50;
    const majorStep = 10;

    for (let i = 0; i <= length / step + 2; i++) {
      const pos = i * step - offset;
      const isMajor = i % majorStep === 0;

      if (direction === "horizontal") {
        marks.push(
          <Box
            key={i}
            sx={{
              position: "absolute",
              left: pos,
              top: 0,
              bottom: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <Box
              sx={{
                width: 1,
                height: isMajor ? 12 : 6,
                backgroundColor: "rgba(255,255,255,0.3)",
              }}
            />
            {isMajor && (
              <Typography
                variant="caption"
                sx={{
                  fontSize: 9,
                  color: "rgba(255,255,255,0.5)",
                  mt: 0.25,
                  userSelect: "none",
                }}
              >
                {i * 50}
              </Typography>
            )}
          </Box>
        );
      } else {
        marks.push(
          <Box
            key={i}
            sx={{
              position: "absolute",
              top: pos,
              left: 0,
              right: 0,
              display: "flex",
              alignItems: "center",
            }}
          >
            <Box
              sx={{
                height: 1,
                width: isMajor ? 12 : 6,
                backgroundColor: "rgba(255,255,255,0.3)",
              }}
            />
            {isMajor && (
              <Typography
                variant="caption"
                sx={{
                  fontSize: 9,
                  color: "rgba(255,255,255,0.5)",
                  ml: 0.25,
                  userSelect: "none",
                }}
              >
                {i * 50}
              </Typography>
            )}
          </Box>
        );
      }
    }

    return marks;
  }, [direction, length, offset]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.innerHTML = "";
    }
  }, [direction, length, offset]);

  return (
    <Box
      ref={containerRef}
      sx={{
        position: "absolute",
        backgroundColor: "rgba(25,27,30,0.95)",
        zIndex: 10,
        ...(direction === "horizontal"
          ? {
              top: 0,
              left: 0,
              right: 0,
              height: 32,
              borderBottom: 1,
              borderColor: "divider",
            }
          : {
              top: 0,
              left: 0,
              bottom: 0,
              width: 32,
              borderRight: 1,
              borderColor: "divider",
            }),
      }}
    >
      {generateMarks()}
    </Box>
  );
}
