-- Doing module database schema
-- Task automation and workflow management tables

-- Tasks table - individual task items
CREATE TABLE IF NOT EXISTS tasks (
  id varchar(36) NOT NULL PRIMARY KEY,
  churchId varchar(36) NOT NULL,
  assignedToId varchar(36),
  title varchar(100) NOT NULL,
  description TEXT,
  dueDate date,
  priority varchar(20) DEFAULT 'medium',
  status varchar(20) DEFAULT 'pending',
  category varchar(50),
  estimatedHours decimal(4,2),
  actualHours decimal(4,2),
  completedDate datetime,
  removed boolean DEFAULT false,
  createdDate datetime DEFAULT CURRENT_TIMESTAMP,
  modifiedDate datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tasks_church (churchId),
  INDEX idx_tasks_assignedTo (assignedToId),
  INDEX idx_tasks_status (status),
  INDEX idx_tasks_dueDate (dueDate)
);

-- Workflows table - automation workflow definitions
CREATE TABLE IF NOT EXISTS workflows (
  id varchar(36) NOT NULL PRIMARY KEY,
  churchId varchar(36) NOT NULL,
  name varchar(100) NOT NULL,
  description TEXT,
  triggerType varchar(50) NOT NULL,
  triggerData TEXT,
  isActive boolean DEFAULT true,
  removed boolean DEFAULT false,
  createdDate datetime DEFAULT CURRENT_TIMESTAMP,
  modifiedDate datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_workflows_church (churchId),
  INDEX idx_workflows_triggerType (triggerType),
  INDEX idx_workflows_active (isActive)
);

-- Workflow conditions table - conditional logic for workflows
CREATE TABLE IF NOT EXISTS workflowConditions (
  id varchar(36) NOT NULL PRIMARY KEY,
  churchId varchar(36) NOT NULL,
  workflowId varchar(36) NOT NULL,
  conditionType varchar(50) NOT NULL,
  field varchar(100),
  operator varchar(20),
  value varchar(255),
  sort int DEFAULT 0,
  removed boolean DEFAULT false,
  createdDate datetime DEFAULT CURRENT_TIMESTAMP,
  modifiedDate datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_workflowConditions_church (churchId),
  INDEX idx_workflowConditions_workflow (workflowId)
);

-- Workflow actions table - actions to execute when conditions are met
CREATE TABLE IF NOT EXISTS workflowActions (
  id varchar(36) NOT NULL PRIMARY KEY,
  churchId varchar(36) NOT NULL,
  workflowId varchar(36) NOT NULL,
  actionType varchar(50) NOT NULL,
  actionData TEXT,
  sort int DEFAULT 0,
  removed boolean DEFAULT false,
  createdDate datetime DEFAULT CURRENT_TIMESTAMP,
  modifiedDate datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_workflowActions_church (churchId),
  INDEX idx_workflowActions_workflow (workflowId)
);

-- Workflow executions table - log of workflow runs
CREATE TABLE IF NOT EXISTS workflowExecutions (
  id varchar(36) NOT NULL PRIMARY KEY,
  churchId varchar(36) NOT NULL,
  workflowId varchar(36) NOT NULL,
  triggeredBy varchar(100),
  triggerData TEXT,
  status varchar(20) DEFAULT 'running',
  executionTime datetime DEFAULT CURRENT_TIMESTAMP,
  completedTime datetime,
  errorMessage TEXT,
  removed boolean DEFAULT false,
  INDEX idx_workflowExecutions_church (churchId),
  INDEX idx_workflowExecutions_workflow (workflowId),
  INDEX idx_workflowExecutions_status (status),
  INDEX idx_workflowExecutions_time (executionTime)
);

-- Task assignments table - linking tasks to people/groups
CREATE TABLE IF NOT EXISTS taskAssignments (
  id varchar(36) NOT NULL PRIMARY KEY,
  churchId varchar(36) NOT NULL,
  taskId varchar(36) NOT NULL,
  assigneeType varchar(20) NOT NULL,
  assigneeId varchar(36) NOT NULL,
  assignedDate datetime DEFAULT CURRENT_TIMESTAMP,
  removed boolean DEFAULT false,
  INDEX idx_taskAssignments_church (churchId),
  INDEX idx_taskAssignments_task (taskId),
  INDEX idx_taskAssignments_assignee (assigneeType, assigneeId)
);