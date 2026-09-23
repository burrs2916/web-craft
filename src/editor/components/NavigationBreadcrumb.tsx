import Box from "@mui/material/Box";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import { useMemo } from "react";
import { useNavigationStore } from "../../store/navigationStore";
import { NavigationExecutor } from "../runtime/NavigationExecutor";

/**
 * NavigationBreadcrumb - 导航面包屑组件
 * 显示当前导航历史路径，支持点击回退到任意层级
 */
export function NavigationBreadcrumb() {
  // 直接订阅原始状态；不要调用 getBreadcrumbs()（它每次返回新数组，
  // 会让 useSyncExternalStore 认为快照持续变化 → 无限重渲染崩溃）。
  const history = useNavigationStore((s) => s.history);
  const currentIndex = useNavigationStore((s) => s.currentIndex);
  const goTo = useNavigationStore((s) => s.goTo);

  const breadcrumbs = useMemo(
    () => history.slice(0, currentIndex + 1),
    [history, currentIndex],
  );

  // 导航历史为空时不显示
  if (breadcrumbs.length <= 1) return null;

  return (
    <Box
      sx={{
        position: "absolute",
        top: 8,
        left: 8,
        zIndex: 1000,
        backgroundColor: (theme) =>
          theme.palette.mode === "dark"
            ? "rgba(30,30,42,0.85)"
            : "rgba(255,255,255,0.85)",
        borderRadius: 1.5,
        px: 1.5,
        py: 0.5,
        backdropFilter: "blur(12px)",
        border: 1,
        borderColor: (theme) =>
          theme.palette.mode === "dark"
            ? "rgba(255,255,255,0.08)"
            : "rgba(0,0,0,0.06)",
        pointerEvents: "auto",
      }}
    >
      <Breadcrumbs
        separator={<NavigateNextIcon sx={{ fontSize: 14 }} />}
        sx={{
          "& .MuiBreadcrumbs-li": { lineHeight: 1 },
        }}
      >
        {breadcrumbs.map((entry, index) => {
          const isLast = index === breadcrumbs.length - 1;

          if (isLast) {
            return (
              <Typography
                key={entry.timestamp}
                variant="caption"
                sx={{
                  color: "text.primary",
                  fontWeight: 500,
                }}
              >
                {entry.sceneName}
              </Typography>
            );
          }

          return (
            <Link
              key={entry.timestamp}
              component="button"
              variant="caption"
              underline="hover"
              color="text.secondary"
              onClick={() => {
                const target = goTo(index);
                if (target) {
                  NavigationExecutor.execute({
                    sceneId: target.sceneId,
                    viewId: target.viewId || undefined,
                    openMode: "replace",
                    variables: target.variables,
                  });
                }
              }}
              sx={{ fontSize: "0.75rem", cursor: "pointer" }}
            >
              {entry.sceneName}
            </Link>
          );
        })}
      </Breadcrumbs>
    </Box>
  );
}
