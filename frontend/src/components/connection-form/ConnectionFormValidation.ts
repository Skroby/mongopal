// Validation logic for connection form

import type { ConnectionFormData, ValidationError, TabId } from './ConnectionFormTypes';

/**
 * Validates the entire form and returns all errors.
 */
export function validateForm(data: ConnectionFormData): ValidationError[] {
  const errors: ValidationError[] = [];

  // Connection tab validation
  errors.push(...validateConnectionTab(data));

  // Authentication tab validation
  errors.push(...validateAuthenticationTab(data));

  // Network tab validation
  errors.push(...validateNetworkTab(data));

  // Options tab validation
  errors.push(...validateOptionsTab(data));

  // Safety tab validation
  errors.push(...validateSafetyTab(data));

  return errors;
}

function validateConnectionTab(data: ConnectionFormData): ValidationError[] {
  const errors: ValidationError[] = [];

  // Name is required
  if (!data.name || data.name.trim() === '') {
    errors.push({
      field: 'name',
      tab: 'connection',
      message: 'Connection name is required',
      severity: 'error',
    });
  }

  // Connection type specific validation
  if (data.connectionType === 'srv') {
    if (!data.srvHostname || data.srvHostname.trim() === '') {
      errors.push({
        field: 'srvHostname',
        tab: 'connection',
        message: 'SRV hostname is required',
        severity: 'error',
      });
    }
  } else {
    // Standalone or replica set - validate hosts
    if (data.hosts.length === 0) {
      errors.push({
        field: 'hosts',
        tab: 'connection',
        message: 'At least one host is required',
        severity: 'error',
      });
    } else {
      data.hosts.forEach((host, index) => {
        if (!host.host || host.host.trim() === '') {
          errors.push({
            field: `hosts[${index}].host`,
            tab: 'connection',
            message: `Host ${index + 1} is required`,
            severity: 'error',
          });
        }
        if (host.port < 1 || host.port > 65535) {
          errors.push({
            field: `hosts[${index}].port`,
            tab: 'connection',
            message: `Port must be between 1 and 65535`,
            severity: 'error',
          });
        }
      });
    }

    // Replica set name required for replica set type
    if (data.connectionType === 'replicaset' && (!data.replicaSetName || data.replicaSetName.trim() === '')) {
      errors.push({
        field: 'replicaSetName',
        tab: 'connection',
        message: 'Replica set name is required for replica set connections',
        severity: 'error',
      });
    }
  }

  return errors;
}

function validateAuthenticationTab(data: ConnectionFormData): ValidationError[] {
  const errors: ValidationError[] = [];

  // Username required for most auth mechanisms
  if (data.authMechanism !== 'none' && data.authMechanism !== 'mongodb-aws') {
    if (!data.username || data.username.trim() === '') {
      errors.push({
        field: 'username',
        tab: 'authentication',
        message: 'Username is required for this authentication mechanism',
        severity: 'error',
      });
    }
  }

  // X.509 requires TLS (show on authentication tab since the mechanism is there)
  if (data.authMechanism === 'x509' && !data.tlsEnabled) {
    errors.push({
      field: 'authMechanism',
      tab: 'authentication',
      message: 'X.509 authentication requires TLS to be enabled (see Network tab)',
      severity: 'error',
    });
  }

  return errors;
}

function validateNetworkTab(data: ConnectionFormData): ValidationError[] {
  const errors: ValidationError[] = [];

  // TLS validation (moved from authentication tab)
  if (data.tlsEnabled) {
    // Warn about insecure TLS in production
    if (data.tlsInsecure) {
      errors.push({
        field: 'tlsInsecure',
        tab: 'network',
        message: 'Allowing invalid certificates is insecure and should not be used in production',
        severity: 'warning',
      });
    }
  }

  // SSH validation
  if (data.sshEnabled) {
    if (!data.sshHost || data.sshHost.trim() === '') {
      errors.push({
        field: 'sshHost',
        tab: 'network',
        message: 'SSH host is required when SSH tunnel is enabled',
        severity: 'error',
      });
    }
    if (!data.sshUser || data.sshUser.trim() === '') {
      errors.push({
        field: 'sshUser',
        tab: 'network',
        message: 'SSH user is required when SSH tunnel is enabled',
        severity: 'error',
      });
    }
    if (data.sshPort < 1 || data.sshPort > 65535) {
      errors.push({
        field: 'sshPort',
        tab: 'network',
        message: 'SSH port must be between 1 and 65535',
        severity: 'error',
      });
    }

    if (data.sshAuthMethod === 'password') {
      if (!data.sshPassword) {
        errors.push({
          field: 'sshPassword',
          tab: 'network',
          message: 'SSH password is required for password authentication',
          severity: 'error',
        });
      }
    } else {
      if (!data.sshPrivateKey) {
        errors.push({
          field: 'sshPrivateKey',
          tab: 'network',
          message: 'SSH private key is required for key-based authentication',
          severity: 'error',
        });
      }
    }

    // Warn about SSH + replica set
    if (data.connectionType === 'replicaset') {
      errors.push({
        field: 'sshEnabled',
        tab: 'network',
        message: 'SSH tunnels may not work correctly with replica sets due to member discovery',
        severity: 'warning',
      });
    }
  }

  // SOCKS5 validation
  if (data.socks5Enabled) {
    if (!data.socks5Host || data.socks5Host.trim() === '') {
      errors.push({
        field: 'socks5Host',
        tab: 'network',
        message: 'SOCKS5 host is required when proxy is enabled',
        severity: 'error',
      });
    }
    if (data.socks5Port < 1 || data.socks5Port > 65535) {
      errors.push({
        field: 'socks5Port',
        tab: 'network',
        message: 'SOCKS5 port must be between 1 and 65535',
        severity: 'error',
      });
    }
    if (data.socks5RequiresAuth) {
      if (!data.socks5User || data.socks5User.trim() === '') {
        errors.push({
          field: 'socks5User',
          tab: 'network',
          message: 'SOCKS5 username is required when authentication is enabled',
          severity: 'error',
        });
      }
      if (!data.socks5Password) {
        errors.push({
          field: 'socks5Password',
          tab: 'network',
          message: 'SOCKS5 password is required when authentication is enabled',
          severity: 'error',
        });
      }
    }
  }

  // Timeout validation
  if (data.connectTimeout < 0 || data.connectTimeout > 300) {
    errors.push({
      field: 'connectTimeout',
      tab: 'network',
      message: 'Connect timeout must be between 0 and 300 seconds',
      severity: 'error',
    });
  }
  if (data.socketTimeout < 0 || data.socketTimeout > 300) {
    errors.push({
      field: 'socketTimeout',
      tab: 'network',
      message: 'Socket timeout must be between 0 and 300 seconds',
      severity: 'error',
    });
  }
  if (data.serverSelectionTimeout < 0 || data.serverSelectionTimeout > 300) {
    errors.push({
      field: 'serverSelectionTimeout',
      tab: 'network',
      message: 'Server selection timeout must be between 0 and 300 seconds',
      severity: 'error',
    });
  }

  return errors;
}

function validateOptionsTab(data: ConnectionFormData): ValidationError[] {
  const errors: ValidationError[] = [];

  // Max pool size
  if (data.maxPoolSize < 1 || data.maxPoolSize > 1000) {
    errors.push({
      field: 'maxPoolSize',
      tab: 'options',
      message: 'Max pool size must be between 1 and 1000',
      severity: 'error',
    });
  }

  // Write concern validation
  if (data.writeConcernWTimeout && data.writeConcernWTimeout < 0) {
    errors.push({
      field: 'writeConcernWTimeout',
      tab: 'options',
      message: 'Write concern timeout cannot be negative',
      severity: 'error',
    });
  }

  return errors;
}

function validateSafetyTab(data: ConnectionFormData): ValidationError[] {
  const errors: ValidationError[] = [];

  // Destructive delay validation
  if (data.destructiveDelay < 0 || data.destructiveDelay > 10) {
    errors.push({
      field: 'destructiveDelay',
      tab: 'safety',
      message: 'Destructive operation delay must be between 0 and 10 seconds',
      severity: 'error',
    });
  }

  return errors;
}

/**
 * Validates a specific field (for on-blur validation).
 */
export function validateField(field: string, _value: any, data: ConnectionFormData): ValidationError | null {
  // Run full validation and find errors for this field
  const allErrors = validateForm(data);
  return allErrors.find(e => e.field === field) || null;
}

/**
 * Groups errors by tab.
 */
export function groupErrorsByTab(errors: ValidationError[]): Record<TabId, ValidationError[]> {
  const grouped: Record<TabId, ValidationError[]> = {
    connection: [],
    authentication: [],
    network: [],
    options: [],
    safety: [],
    appearance: [],
  };

  errors.forEach(error => {
    grouped[error.tab].push(error);
  });

  return grouped;
}

/**
 * Counts errors and warnings per tab.
 */
export function countErrorsPerTab(errors: ValidationError[]): Record<TabId, { errors: number; warnings: number }> {
  const counts: Record<TabId, { errors: number; warnings: number }> = {
    connection: { errors: 0, warnings: 0 },
    authentication: { errors: 0, warnings: 0 },
    network: { errors: 0, warnings: 0 },
    options: { errors: 0, warnings: 0 },
    safety: { errors: 0, warnings: 0 },
    appearance: { errors: 0, warnings: 0 },
  };

  errors.forEach(error => {
    if (error.severity === 'error') {
      counts[error.tab].errors++;
    } else {
      counts[error.tab].warnings++;
    }
  });

  return counts;
}
