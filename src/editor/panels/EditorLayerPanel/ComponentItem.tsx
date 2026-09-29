import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Collapse from "@mui/material/Collapse";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import DeleteIcon from "@mui/icons-material/Delete";
import { useState } from "react";
import type { SceneComponent } from "../../../types/editor";
import { componentRegistry } from "../../registry";

interface ComponentItemProps {
  comp: SceneComponent;
  depth: number;
  selectedIds: string[];
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onDelete: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  childComponents: SceneComponent[];
  childrenMap: Map<string, SceneComponent[]>;
}

/** 图层树中的单个组件节点（可展开子组件）。 */
export function ComponentItem({
  comp,
  depth,
  selectedIds,
  hoveredId,
  onSelect,
  onHover,
  onDelete,
  onToggleVisibility,
  childComponents,
  childrenMap,
}: ComponentItemProps) {
  const [expanded, setExpanded] = useState(true);
  const definition = componentRegistry.get(comp.type);
  const isSelected = selectedIds.includes(comp.id);
  const isHovered = hoveredId === comp.id;
  const hasChildren = childComponents.length > 0;

  return (
    <Box>
      <Box
        onClick={() => onSelect(comp.id)}
        onMouseEnter={() => onHover(comp.id)}
        onMouseLeave={() => onHover(null)}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          pl: 2 + depth * 1.5,
          pr: 0.5,
          py: 0.2,
          cursor: "pointer",
          borderRadius: 0.5,
          mx: 0.5,
          backgroundColor: isSelected
            ? "action.selected"
            : isHovered
              ? "action.hover"
              : "transparent",
          transition: "background-color 0.1s",
          borderLeft: "2px solid",
          borderLeftColor: "divider",
          ml: 1,
        }}
      >
        {hasChildren ? (
          <IconButton
            size="small"
            sx={{ p: 0, width: 16, height: 16, flexShrink: 0 }}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            {expanded ? (
              <ExpandMoreIcon sx={{ fontSize: 12 }} />
            ) : (
              <ChevronRightIcon sx={{ fontSize: 12 }} />
            )}
          </IconButton>
        ) : (
          <Box sx={{ width: 16, height: 16, flexShrink: 0 }} />
        )}
        <Box
          sx={{
            width: 4,
            height: 4,
            borderRadius: "50%",
            backgroundColor: comp.visible ? "text.secondary" : "text.disabled",
            flexShrink: 0,
          }}
        />
        <Typography
          variant="caption"
          noWrap
          sx={{
            flex: 1,
            fontSize: 10,
            opacity: comp.visible ? 0.8 : 0.4,
            color: "text.secondary",
          }}
        >
          {comp.name}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            fontSize: 9,
            color: "text.disabled",
            flexShrink: 0,
            mr: 0.5,
          }}
        >
          {definition?.name || comp.type}
        </Typography>
        <Box sx={{ display: "flex", gap: 0.25, ml: "auto" }}>
          <IconButton
            size="small"
            sx={{
              p: 0.15,
              opacity: isHovered ? 1 : 0.3,
              transition: "opacity 0.15s",
            }}
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisibility(comp.id);
            }}
          >
            {comp.visible ? (
              <VisibilityIcon sx={{ fontSize: 10 }} />
            ) : (
              <VisibilityOffIcon sx={{ fontSize: 10 }} />
            )}
          </IconButton>
          <IconButton
            size="small"
            sx={{
              p: 0.15,
              opacity: isHovered ? 1 : 0,
              transition: "opacity 0.15s",
              "&:hover": { color: "error.main" },
            }}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(comp.id);
            }}
          >
            <DeleteIcon sx={{ fontSize: 10 }} />
          </IconButton>
        </Box>
      </Box>

      {hasChildren && (
        <Collapse in={expanded} timeout="auto">
          {childComponents.map((child) => (
            <ComponentItem
              key={child.id}
              comp={child}
              depth={depth + 1}
              selectedIds={selectedIds}
              hoveredId={hoveredId}
              onSelect={onSelect}
              onHover={onHover}
              onDelete={onDelete}
              onToggleVisibility={onToggleVisibility}
              childComponents={childrenMap.get(child.id) || []}
              childrenMap={childrenMap}
            />
          ))}
        </Collapse>
      )}
    </Box>
  );
}