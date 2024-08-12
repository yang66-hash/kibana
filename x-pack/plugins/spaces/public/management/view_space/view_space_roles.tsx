/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiButton,
  EuiButtonEmpty,
  EuiButtonGroup,
  EuiCallOut,
  EuiComboBox,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiForm,
  EuiFormRow,
  EuiLink,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import type { EuiComboBoxOptionOption } from '@elastic/eui';
import type { FC } from 'react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { KibanaFeature, KibanaFeatureConfig } from '@kbn/features-plugin/common';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { Role } from '@kbn/security-plugin-types-common';

import { SpaceAssignedRolesTable } from './component/space_assigned_roles_table';
import { useViewSpaceServices, type ViewSpaceServices } from './hooks/view_space_context_provider';
import type { Space } from '../../../common';
import { FeatureTable } from '../edit_space/enabled_features/feature_table';

type RolesAPIClient = ReturnType<ViewSpaceServices['getRolesAPIClient']> extends Promise<infer R>
  ? R
  : never;

type KibanaPrivilegeBase = keyof NonNullable<KibanaFeatureConfig['privileges']>;

interface Props {
  space: Space;
  /**
   * List of roles assigned to this space
   */
  roles: Role[];
  features: KibanaFeature[];
  isReadOnly: boolean;
}

// FIXME: rename to EditSpaceAssignedRoles
export const ViewSpaceAssignedRoles: FC<Props> = ({ space, roles, features, isReadOnly }) => {
  const [showRolesPrivilegeEditor, setShowRolesPrivilegeEditor] = useState(false);
  const [roleAPIClientInitialized, setRoleAPIClientInitialized] = useState(false);
  const [spaceUnallocatedRole, setSpaceUnallocatedRole] = useState<Role[]>([]);

  const rolesAPIClient = useRef<RolesAPIClient>();

  const { getRolesAPIClient, getUrlForApp } = useViewSpaceServices();

  const resolveRolesAPIClient = useCallback(async () => {
    try {
      rolesAPIClient.current = await getRolesAPIClient();
      setRoleAPIClientInitialized(true);
    } catch {
      //
    }
  }, [getRolesAPIClient]);

  useEffect(() => {
    if (!isReadOnly) {
      resolveRolesAPIClient();
    }
  }, [isReadOnly, resolveRolesAPIClient]);

  useEffect(() => {
    async function fetchAllSystemRoles() {
      const systemRoles = (await rolesAPIClient.current?.getRoles()) ?? [];

      // exclude roles that are already assigned to this space
      const spaceUnallocatedRoles = systemRoles.filter(
        (role) =>
          !role.metadata?._reserved &&
          role.kibana.some((privileges) => {
            return !privileges.spaces.includes(space.id) || !privileges.spaces.includes('*');
          })
      );

      setSpaceUnallocatedRole(spaceUnallocatedRoles);
    }

    if (roleAPIClientInitialized) {
      fetchAllSystemRoles?.();
    }
  }, [roleAPIClientInitialized, space.id]);

  return (
    <>
      {showRolesPrivilegeEditor && (
        <PrivilegesRolesForm
          features={features}
          space={space}
          closeFlyout={() => {
            setShowRolesPrivilegeEditor(false);
          }}
          onSaveClick={() => {
            setShowRolesPrivilegeEditor(false);
          }}
          spaceUnallocatedRole={spaceUnallocatedRole}
          // rolesAPIClient would have been initialized before the privilege editor is displayed
          roleAPIClient={rolesAPIClient.current!}
        />
      )}
      <EuiFlexGroup direction="column">
        <EuiFlexItem>
          <EuiText>
            <FormattedMessage
              id="xpack.spaces.management.spaceDetails.roles.heading"
              defaultMessage="Assign roles to this space so that users with those roles are able to access it. You can create and edit them in {linkToRolesPage}."
              values={{
                linkToRolesPage: (
                  <EuiLink href={getUrlForApp('management', { deepLinkId: 'roles' })}>
                    {i18n.translate(
                      'xpack.spaces.management.spaceDetails.roles.rolesPageAnchorText',
                      { defaultMessage: 'Roles' }
                    )}
                  </EuiLink>
                ),
              }}
            />
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem>
          <SpaceAssignedRolesTable
            isReadOnly={isReadOnly || !spaceUnallocatedRole.length}
            assignedRoles={roles}
            onAssignNewRoleClick={async () => {
              if (!roleAPIClientInitialized) {
                await resolveRolesAPIClient();
              }
              setShowRolesPrivilegeEditor(true);
            }}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    </>
  );
};

interface PrivilegesRolesFormProps extends Omit<Props, 'isReadOnly' | 'roles'> {
  closeFlyout: () => void;
  onSaveClick: () => void;
  spaceUnallocatedRole: Role[];
  roleAPIClient: RolesAPIClient;
}

const createRolesComboBoxOptions = (roles: Role[]): Array<EuiComboBoxOptionOption<Role>> =>
  roles.map((role) => ({
    label: role.name,
    value: role,
  }));

export const PrivilegesRolesForm: FC<PrivilegesRolesFormProps> = (props) => {
  const { onSaveClick, closeFlyout, features, roleAPIClient, spaceUnallocatedRole } = props;

  const [space, setSpaceState] = useState<Partial<Space>>(props.space);
  const [spacePrivilege, setSpacePrivilege] = useState<KibanaPrivilegeBase | 'custom'>('all');
  const [selectedRoles, setSelectedRoles] = useState<ReturnType<typeof createRolesComboBoxOptions>>(
    []
  );
  const selectedRolesHasPrivilegeConflict = useMemo(() => {
    return selectedRoles.reduce((result, selectedRole) => {
      // TODO: determine heuristics for role privilege conflicts
      return result;
    }, false);
  }, [selectedRoles]);

  const [assigningToRole, setAssigningToRole] = useState(false);

  const assignRolesToSpace = useCallback(async () => {
    try {
      setAssigningToRole(true);

      await Promise.all(
        selectedRoles.map((selectedRole) => {
          roleAPIClient.saveRole({ role: selectedRole.value! });
        })
      ).then(setAssigningToRole.bind(null, false));

      onSaveClick();
    } catch {
      // Handle resulting error
    }
  }, [onSaveClick, roleAPIClient, selectedRoles]);

  const getForm = () => {
    return (
      <EuiForm component="form" fullWidth>
        <EuiFormRow label="Select a role(s)">
          <EuiComboBox
            data-test-subj="roleSelectionComboBox"
            aria-label={i18n.translate('xpack.spaces.management.spaceDetails.roles.selectRoles', {
              defaultMessage: 'Select role to assign to the {spaceName} space',
              values: { spaceName: space.name },
            })}
            placeholder="Select roles"
            options={createRolesComboBoxOptions(spaceUnallocatedRole)}
            selectedOptions={selectedRoles}
            onChange={(value) => {
              setSelectedRoles((prevRoles) => {
                if (prevRoles.length < value.length) {
                  const newlyAdded = value[value.length - 1];

                  const { name: spaceName } = space;
                  if (!spaceName) {
                    throw new Error('space state requires name!');
                  }

                  // Add kibana space privilege definition to role
                  newlyAdded.value!.kibana.push({
                    spaces: [spaceName],
                    base: spacePrivilege === 'custom' ? [] : [spacePrivilege],
                    feature: {},
                  });

                  return prevRoles.concat(newlyAdded);
                } else {
                  return value;
                }
              });
            }}
            fullWidth
          />
        </EuiFormRow>
        <>
          {!selectedRolesHasPrivilegeConflict && (
            <EuiFormRow>
              <EuiCallOut
                color="warning"
                iconType="iInCircle"
                title={i18n.translate(
                  'xpack.spaces.management.spaceDetails.roles.assign.privilegeConflictMsg.title',
                  {
                    defaultMessage: 'Selected roles have different privileges granted',
                  }
                )}
              >
                {i18n.translate(
                  'xpack.spaces.management.spaceDetails.roles.assign.privilegeConflictMsg.description',
                  {
                    defaultMessage:
                      'Updating the settings here in a bulk will override current individual settings.',
                  }
                )}
              </EuiCallOut>
            </EuiFormRow>
          )}
        </>
        <EuiFormRow
          helpText={i18n.translate(
            'xpack.spaces.management.spaceDetails.roles.assign.privilegesHelpText',
            {
              defaultMessage:
                'Assign the privilege you wish to grant to all present and future features across this space',
            }
          )}
        >
          <EuiButtonGroup
            legend="select the privilege for the features enabled in this space"
            options={[
              {
                id: 'all',
                label: i18n.translate(
                  'xpack.spaces.management.spaceDetails.roles.assign.privileges.all',
                  {
                    defaultMessage: 'All',
                  }
                ),
              },
              {
                id: 'read',
                label: i18n.translate(
                  'xpack.spaces.management.spaceDetails.roles.assign.privileges.read',
                  { defaultMessage: 'Read' }
                ),
              },
              {
                id: 'custom',
                label: i18n.translate(
                  'xpack.spaces.management.spaceDetails.roles.assign.privileges.custom',
                  { defaultMessage: 'Customize' }
                ),
              },
            ].map((privilege) => ({
              ...privilege,
              'data-test-subj': `${privilege.id}-privilege-button`,
            }))}
            color="primary"
            idSelected={spacePrivilege}
            onChange={(id) => setSpacePrivilege(id as KibanaPrivilegeBase | 'custom')}
            buttonSize="compressed"
            isFullWidth
          />
        </EuiFormRow>
        {spacePrivilege === 'custom' && (
          <EuiFormRow
            label={i18n.translate(
              'xpack.spaces.management.spaceDetails.roles.assign.privileges.customizeLabelText',
              { defaultMessage: 'Customize by feature' }
            )}
          >
            <>
              <EuiText size="xs">
                <p>
                  <FormattedMessage
                    id="xpack.spaces.management.spaceDetails.roles.assign.privileges.customizeDescriptionText"
                    defaultMessage="Increase privilege levels per feature basis. Some features might be hidden by the
                  space or affected by a global space privilege"
                  />
                </p>
              </EuiText>
              <EuiSpacer />
              <FeatureTable space={space} features={features} onChange={setSpaceState} />
            </>
          </EuiFormRow>
        )}
      </EuiForm>
    );
  };

  const getSaveButton = () => {
    return (
      <EuiButton
        fill
        isLoading={assigningToRole}
        onClick={() => assignRolesToSpace()}
        data-test-subj={'createRolesPrivilegeButton'}
      >
        {i18n.translate('xpack.spaces.management.spaceDetails.roles.assignRoleButton', {
          defaultMessage: 'Assign roles',
        })}
      </EuiButton>
    );
  };

  return (
    <EuiFlyout onClose={closeFlyout} size="s">
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="m">
          <h2>
            {i18n.translate('xpack.spaces.management.spaceDetails.roles.assign.privileges.custom', {
              defaultMessage: 'Assign role to {spaceName}',
              values: { spaceName: space.name },
            })}
          </h2>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiText size="s">
          <p>
            <FormattedMessage
              id="xpack.spaces.management.spaceDetails.privilegeForm.heading"
              defaultMessage="Roles will be granted access to the current space according to their default privileges. Use the &lsquo;Customize&rsquo; option to override default privileges."
            />
          </p>
        </EuiText>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>{getForm()}</EuiFlyoutBody>
      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="spaceBetween">
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              iconType="cross"
              onClick={closeFlyout}
              flush="left"
              data-test-subj={'cancelRolesPrivilegeButton'}
            >
              {i18n.translate('xpack.spaces.management.spaceDetails.roles.cancelRoleButton', {
                defaultMessage: 'Cancel',
              })}
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>{getSaveButton()}</EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};
