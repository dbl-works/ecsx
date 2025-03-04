import { RunTaskCommandInput } from '@aws-sdk/client-ecs'
import { findCluster } from '../config'

import { Configuration, ConfiguredVariables } from '../types/configuration'

interface Params {
  clusterName: string
  taskName: string
  revision: string
  variables: ConfiguredVariables
  config: Configuration
  alias?: string // Allow custom name, for example when running a console task using existing container
  enableExecuteCommand?: boolean
  subnet?: string // public/private from user input
}

export const taskFromConfiguration = (params: Params): RunTaskCommandInput => {
  const { clusterName, taskName, revision, variables, config, alias, subnet, enableExecuteCommand = false } = params
  const { project, environment, region } = variables

  const clusterConfig = findCluster(config, clusterName, region)
  if (clusterConfig === undefined) {
    throw new Error('Cluster not found')
  }

  const taskConfig = config.tasks[taskName]
  let taskSubnet: 'private' | 'public'

  if (subnet === 'public') {
    taskSubnet = 'public'
  } else if (subnet === 'private') {
    taskSubnet = 'private'
  } else {
    taskSubnet = taskConfig.subnet
  }

  const subnets = clusterConfig.subnets[taskSubnet]
  const securityGroups = clusterConfig.securityGroups
  const assignPublicIp = taskSubnet === 'public'

  const overrides = (() => {
    if (enableExecuteCommand === false) {
      return
    }

    // The sleep task keep the container alive for X amount of seconds
    // Once the sleep is finished, the container is exit gracefully and no longer be billed
    return {
      containerOverrides: [
        {
          name: taskName,
          command: [
            'sleep',
            '3360', // 56 minutes. vCPU units are billed per (partial) hour
          ],
        },
      ],
    }
  })()

  return {
    cluster: clusterName,
    taskDefinition: `${project}-${taskName}-${environment}:${revision}`,
    count: 1,
    group: `task:${alias || taskName}`,
    launchType: 'FARGATE',
    enableExecuteCommand,
    networkConfiguration: {
      awsvpcConfiguration: {
        subnets,
        securityGroups,
        assignPublicIp: assignPublicIp ? 'ENABLED' : 'DISABLED',
      },
    },
    overrides,
  }
}
