import { Box, Typography, Button, Snackbar, Alert } from '@mui/material';
import { PlusIcon } from '@phosphor-icons/react';
import { GRADIENT } from './constants';
import { useAgentManager } from './useAgentManager';
import { AgentListPanel } from './AgentListPanel';
import { AgentEmptyState } from './AgentEmptyState';
import { AgentEditorDialog } from './AgentEditorDialog';
import { DeleteAgentDialog } from './DeleteAgentDialog';

export function AgentManager() {
  const mgr = useAgentManager();
  const { t, isDark, editing, agents } = mgr;
  const isExisting = !!(editing && agents.find((a) => a.id === editing.id));

  return (
    <Box sx={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', p: { xs: 2, md: 2.5 }, gap: 2.5, minWidth: 0, minHeight: 0 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <Typography variant="h6" sx={{ flex: 1, fontWeight: 700, fontSize: 18 }}>
          {t('agent.manager_title')}
        </Typography>
        <Button
          variant="contained"
          startIcon={<PlusIcon size={18} weight="bold" />}
          onClick={mgr.handleNew}
          sx={{
            textTransform: 'none',
            color: '#fff',
            background: GRADIENT,
            boxShadow: '0 2px 8px rgba(45,212,191,0.3)',
            fontSize: 13,
            px: 2.5,
            py: 1,
            '&:hover': { boxShadow: '0 4px 14px rgba(45,212,191,0.45)', background: GRADIENT },
          }}
        >
          {t('agent.new_agent')}
        </Button>
      </Box>

      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', gap: 2.5, minHeight: 0 }}>
        {/* Left: agent list */}
        <AgentListPanel
          agents={agents}
          models={mgr.models}
          endpoints={mgr.endpoints}
          filteredAgents={mgr.filteredAgents}
          editingId={editing?.id ?? null}
          search={mgr.search}
          onSearchChange={mgr.setSearch}
          onEdit={mgr.handleEdit}
          onRequestDelete={mgr.requestDelete}
          getToolLabel={mgr.getToolLabel}
          t={t}
        />

        {/* Right: context-aware empty state */}
        <AgentEmptyState hasAgents={agents.length > 0} onNew={mgr.handleNew} isDark={isDark} t={t} />
      </Box>

      {/* Editor Dialog */}
      <AgentEditorDialog
        editing={editing}
        isExisting={isExisting}
        models={mgr.models}
        endpoints={mgr.endpoints}
        enabledModels={mgr.enabledModels}
        triggerTypes={mgr.triggerTypes}
        nameTouched={mgr.nameTouched}
        modelTouched={mgr.modelTouched}
        nameInputRef={mgr.nameInputRef}
        onChange={mgr.setEditing}
        onCancel={mgr.handleCancel}
        onSave={mgr.handleSave}
        onNameTouched={() => mgr.setNameTouched(true)}
        onModelTouched={() => mgr.setModelTouched(true)}
        isDark={isDark}
        t={t}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteAgentDialog
        deleteConfirm={mgr.deleteConfirm}
        onCancel={() => mgr.setDeleteConfirm(null)}
        onConfirm={mgr.handleDelete}
        t={t}
      />

      {/* Snackbar for notifications */}
      <Snackbar
        open={mgr.snackbar.open}
        autoHideDuration={4000}
        onClose={() => mgr.setSnackbar({ ...mgr.snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => mgr.setSnackbar({ ...mgr.snackbar, open: false })}
          severity={mgr.snackbar.severity}
          sx={{ width: '100%' }}
        >
          {mgr.snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}