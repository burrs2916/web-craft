import Box from "@mui/material/Box";
import AddIcon from "@mui/icons-material/Add";
import FolderIcon from "@mui/icons-material/Folder";

/** 文件夹 + 角标加号图标，用于「新建分组」。 */
export function NewFolderIcon({ fontSize = 14 }: { fontSize?: number }) {
  return (
    <Box sx={{ position: "relative", width: fontSize, height: fontSize, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <FolderIcon sx={{ fontSize: fontSize * 0.9 }} />
      <AddIcon
        sx={{
          position: "absolute",
          fontSize: fontSize * 0.5,
          bottom: -1,
          right: -1,
          backgroundColor: "background.paper",
          borderRadius: "50%",
          border: "1px solid",
          borderColor: "divider",
        }}
      />
    </Box>
  );
}