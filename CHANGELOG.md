# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [Unreleased](https://github.com/atomist/skill/compare/0.11.0...HEAD)

### Added

*   Add skill upload and download commands. [a238bb9](https://github.com/atomist-skills/skill/commit/a238bb9bc307553d2f6d4a6c7bb6815c461ee736)
*   Get files only instead of detached clone. [#341](https://github.com/atomist-skills/skill/issues/341)
*   Add commit markers to persistChanges. [c97f69b](https://github.com/atomist-skills/skill/commit/c97f69b38a95ad32886168e13fdb84e6c3d70b48)
*   Add pullRequestHandler. [bb2f4da](https://github.com/atomist-skills/skill/commit/bb2f4dabb591948f7a771d14e279005fc8f5d662)
*   Transact PR and check entities. [#361](https://github.com/atomist-skills/skill/issues/361)
*   Add github.editContent helper. [ffc66de](https://github.com/atomist-skills/skill/commit/ffc66deb4cdc2803eeabda4ceb897af832c5f07d)
*   Add before and after method. [1f691fb](https://github.com/atomist-skills/skill/commit/1f691fb16c67c931a360b913dc6fe6b142640a59)
*   Add sha to persistChanges update callback. [c571f7f](https://github.com/atomist-skills/skill/commit/c571f7f754ab71bba0a9f31640e0caea1163668a)
*   Credential lookup without org and repo. [bfe89d7](https://github.com/atomist-skills/skill/commit/bfe89d7a16ba4183c48a0a8951225da4987f16bd)
*   Support in `run` command for GCP Cloud Run. [#400](https://github.com/atomist-skills/skill/issues/400)
*   Check handler can set PR comment. [13f6c96](https://github.com/atomist-skills/skill/commit/13f6c9609ecc0b2129e1a3cd46a913fa5bb16a09)
*   Add helpers to create and track tmp files and dirs. [1ef713a](https://github.com/atomist-skills/skill/commit/1ef713a76289358081102b2e6f29d7b205f9d88f)
*   Add global option state handling. [2497452](https://github.com/atomist-skills/skill/commit/24974527b88e4ae1df928e9b4a1622c8345cfccc)
*   Transact audit result. [0db7b18](https://github.com/atomist-skills/skill/commit/0db7b184a06a25a298734755ee9c3bd07db7a9a3)

### Changed

*   Skip payload logging for container skills. [ae77043](https://github.com/atomist-skills/skill/commit/ae770439958df58f646bb974cadd66c44306c3da)
*   Add ttl to storage api. [8710804](https://github.com/atomist-skills/skill/commit/8710804ffbd6806ba22333b78e2a81ee580f7f94)
*   Export retry helper. [dafea5d](https://github.com/atomist-skills/skill/commit/dafea5d3213f0f6cd3c5b2d593598be1bb221292)
*   Rename handler to handle in index. [53b06db](https://github.com/atomist-skills/skill/commit/53b06db6e750e02aa1aeb8cecf55a65aae57091f)
*   Handle ref and sha errors in pull_request_handler. [5a229db](https://github.com/atomist-skills/skill/commit/5a229db43d15d97c0d716fa83b7f36151ab6e219)
*   Always push when pullRequest.update is provided. [38f6a87](https://github.com/atomist-skills/skill/commit/38f6a87f13046d24c5506a4f5485efb4134685c9)
*   Switch to safe datomic rules. [03c3fde](https://github.com/atomist-skills/skill/commit/03c3fde81548dc6ab3116c698fab832297332a5f)
*   Add rules to datalog queries. [20d8e48](https://github.com/atomist-skills/skill/commit/20d8e48864fc800731695ded4961c9552bbdc2fb)

### Fixed

*   Do not raise PR when no files have been changed. [2f76973](https://github.com/atomist-skills/skill/commit/2f76973a51efbbbf0a1df6fd84f8328eb3c9c6d2)
*   Fix issue with undefined in subscription result. [12145c1](https://github.com/atomist-skills/skill/commit/12145c1633d04a39f55e1dbf6d8d9ae2e27da8b6)
*   Fix rendering of negative bytes. [6644037](https://github.com/atomist-skills/skill/commit/6644037dcd6ccde1d99e4b102af94036c0ca0261)
*   Ensure dirs exist when cloneFiles is used. [4a54eb9](https://github.com/atomist-skills/skill/commit/4a54eb973a89716682787fa7d9acbea8ded14b41)
*   Create baseDir on project.load. [e201264](https://github.com/atomist-skills/skill/commit/e201264041011cd91f48001b5ad5c2e1d27aa252)
*   Bind ?ctx. [beffcb4](https://github.com/atomist-skills/skill/commit/beffcb419fa23512cd352f4ef7502cd45903e81f)
*   Missing staging support in Datalog query client. [#429](https://github.com/atomist-skills/skill/issues/429)

## [0.11.0](https://github.com/atomist/skill/compare/0.10.0...0.11.0) - 2021-04-26

### Added

*   Add delete to storage interface. [7ff45f4](https://github.com/atomist-skills/skill/commit/7ff45f4c1d380e096e815aa0be954cf0c7cda556)
*   Resolve incoming messages from GCS. [4cc2477](https://github.com/atomist-skills/skill/commit/4cc24773b96e05ce5a670efe4488290e7647b509)

### Changed

*   Add version information to startup. [4deec03](https://github.com/atomist-skills/skill/commit/4deec03b6204045934e55bb54bfe6014fbd16894)

### Removed

*   Change `@google-cloud/functions-framework` dependency. [#153](https://github.com/atomist-skills/skill/issues/153)

## [0.10.0](https://github.com/atomist/skill/compare/0.9.1...0.10.0) - 2021-04-21

### Added

*   Add details to check. [a80b3bd](https://github.com/atomist-skills/skill/commit/a80b3bd8f3ba777765db60ea01a4afba933cf538)
*   Add ability to lazily change PR. [8d6a5f9](https://github.com/atomist-skills/skill/commit/8d6a5f9820adb1ddab2d3c8dc6b34c1322b6ecef)
*   Add pluralization helper. [dd8b8e0](https://github.com/atomist-skills/skill/commit/dd8b8e0b7461f08016106179481ec46151d3ed1b)
*   Add tx to formatMarkers. [2df7dc6](https://github.com/atomist-skills/skill/commit/2df7dc66c0e3d98fd70cef6e06a58a41e434fe2f)
*   Add levenshteinSort helper. [eaf3648](https://github.com/atomist-skills/skill/commit/eaf36487809c159a5c3466282436c2334697b064)
*   Add cachify helper. [b8c8139](https://github.com/atomist-skills/skill/commit/b8c813989c13afd345e4f999865e7d0855705326)

## [0.9.1](https://github.com/atomist/skill/compare/0.9.0...0.9.1) - 2021-04-01

### Added

*   Add truncate helper. [641c6fd](https://github.com/atomist-skills/skill/commit/641c6fd059ea48950e6769f481305622a7eb1471)
*   Add on_push subscription. [70c9a5b](https://github.com/atomist-skills/skill/commit/70c9a5ba0aa759a457d05854f3440db644e16410)
*   Add link to skill and configuration to PR body. [edbca6c](https://github.com/atomist-skills/skill/commit/edbca6c38ad914e6a4d22e0d64d3a7b30345d8c0)
*   Add extension to allow custom mapping. [0f0aedc](https://github.com/atomist-skills/skill/commit/0f0aedc06cd662a0ca0b8ba0740c47e2e938967b)

### Fixed

*   Don't swallow expections in event handlers. [6f53ffd](https://github.com/atomist-skills/skill/commit/6f53ffdf0016e155c29b22da8e9f6c474a329e45)

## [0.9.0](https://github.com/atomist/skill/compare/0.8.1...0.9.0) - 2021-03-01

### Added

*   Add support for Secret parameter type. [#166](https://github.com/atomist-skills/skill/issues/166)
*   Add datalog.entity helper. [73e78f4](https://github.com/atomist-skills/skill/commit/73e78f45af100dadf03898da748ec2abae0f9f87)

### Changed

*   Promote transact to a full Datalog client. [7965595](https://github.com/atomist-skills/skill/commit/7965595371dbc8fa9b4de0ec1a626a54367e156a)

## [0.8.1](https://github.com/atomist/skill/compare/0.8.0...0.8.1) - 2021-02-04

### Fixed

*   Forcibly fetching current branch fails. [#222](https://github.com/atomist-skills/skill/issues/222)

## [0.8.0](https://github.com/atomist/skill/compare/0.7.1...0.8.0) - 2021-02-03

### Added

*   Add capabilities to skill definition. [e47e128](https://github.com/atomist-skills/skill/commit/e47e1288a59a6403d55bb743d2b3a0da4e81aa5a)
*   Add support for uploading code scanning results. [01e646a](https://github.com/atomist-skills/skill/commit/01e646a67b9c43c9024da6486bef794b8cbf9631)

### Changed

*   Update schema. [#202](https://github.com/atomist-skills/skill/pull/202)
*   Set author and committer using env variables. [#215](https://github.com/atomist-skills/skill/issues/215)
*   Change ensureBranch behavior when sync false. [#214](https://github.com/atomist-skills/skill/issues/214)
*   Add ordering to PubSub publishing. [#218](https://github.com/atomist-skills/skill/issues/218)

### Fixed

*   Fix missing await in state hydrate. [d6ec184](https://github.com/atomist-skills/skill/commit/d6ec18420df2fb3d7aaa1aedb1a1a0f953984c45)
*   Error committing changes back into repository. [#210](https://github.com/atomist-skills/skill/issues/210)

## [0.7.1](https://github.com/atomist/skill/compare/0.7.0...0.7.1) - 2021-01-15

### Fixed

*   Fix ensureBranch when branch does not exist. [ad7fd34](https://github.com/atomist-skills/skill/commit/ad7fd34dfc73ac57fc609e91911823f02116b929)
*   Account for all possibilities in ensureBranch. [f6cb5c8](https://github.com/atomist-skills/skill/commit/f6cb5c83e66657a003bf827c6723317819269302)

## [0.7.0](https://github.com/atomist/skill/compare/0.6.2...0.7.0) - 2021-01-11

### Added

*   Add labels to footer. [3bc7412](https://github.com/atomist-skills/skill/commit/3bc7412474e6d867b38a2a66c8704d8fcde830c9)
*   Add git peristChange function. [#159](https://github.com/atomist-skills/skill/issues/159)

### Changed

*   Move text truncation to byte size. [7291c46](https://github.com/atomist-skills/skill/commit/7291c460aa12d24158b5a27a250f51bfedf978eb)

## [0.6.2](https://github.com/atomist/skill/compare/0.6.1...0.6.2) - 2020-12-07

### Added

*   Add footer to check body. [7efd5c1](https://github.com/atomist-skills/skill/commit/7efd5c1901ea2152e6266c30732bb4ef3efffa1f)
*   Add tag and branch filter. [1f84115](https://github.com/atomist-skills/skill/commit/1f84115c83932d6d6fe31739bf2634d7a2e8424d)

### Changed

*   Use same config for globs and type generation. [#143](https://github.com/atomist-skills/skill/issues/143)

## [0.6.1](https://github.com/atomist/skill/compare/0.6.0...0.6.1) - 2020-12-03

### Added

*   Add actions to check helper. [819d13a](https://github.com/atomist-skills/skill/commit/819d13a045a27db76654c7584b7454902af0999d)
*   Add config names and workspaceId to Git markers. [9e89243](https://github.com/atomist-skills/skill/commit/9e89243faa90a568472ac1118646fca8cd618b67)

## [0.6.0](https://github.com/atomist/skill/compare/0.5.1...0.6.0) - 2020-11-24

### Added

*   Add retry on DNS issue to GraphQL client. [96556eb](https://github.com/atomist-skills/skill/commit/96556eb0bc168344aee93951730ea1f660615e81)

### Changed

*   Merge default value into state. [50c1050](https://github.com/atomist-skills/skill/commit/50c1050709bec79b61a2f3aad312aef886530942)

## [0.5.1](https://github.com/atomist/skill/compare/0.5.0...0.5.1) - 2020-11-14

### Added

*   Add visible to visibility in HandlerStatus. [74f608b](https://github.com/atomist-skills/skill/commit/74f608b9a8c2b478b9ec8ddc5873723f314e9313)

## [0.5.0](https://github.com/atomist/skill/compare/0.4.1...0.5.0) - 2020-11-10

### Added

*   Add schema package script. [b65c630](https://github.com/atomist-skills/skill/commit/b65c630f9f3315f6d2c406f19e4faca39e38ea30)
*   Add atm-codegen command to remove code gen from skill projects. [f12243a](https://github.com/atomist-skills/skill/commit/f12243a4ba76ff1a817dd7006157ca4850c0ae81)

### Changed

*   Update schema. [161b4a9](https://github.com/atomist-skills/skill/commit/161b4a91880c556743ed760a34c871bee9bb7b1f)

### Fixed

*   Fix case in provider display names. [cbc50da](https://github.com/atomist-skills/skill/commit/cbc50da4818c9aeb5b5e0b90a8704a52545c6052)

## [0.4.1](https://github.com/atomist/skill/compare/0.4.0...0.4.1) - 2020-10-27

### Added

*   Add support for datalogSubscriptions in skill definitions. [3e4ea81](https://github.com/atomist-skills/skill/commit/3e4ea8187cfbe589ff29e15a8d1b195762250f35)

### Changed

*   Update GraphQL schema. [ce72b84](https://github.com/atomist-skills/skill/commit/ce72b8412b3a07edb7b7c540073f091eab95dbfd)

### Fixed

*   Subsequent edits to managed pull requests remove existing labels. [#100](https://github.com/atomist-skills/skill/issues/100)

## [0.4.0](https://github.com/atomist/skill/compare/0.3.1...0.4.0) - 2020-10-21

### Added

*   Add support for datalog subscriptions. [#94](https://github.com/atomist-skills/skill/issues/94)

## [0.3.1](https://github.com/atomist/skill/compare/0.3.0...0.3.1) - 2020-10-16

### Changed

*   Update title for existing PRs. [2958170](https://github.com/atomist-skills/skill/commit/29581709cf01a5e5e7dfa62dbc43224aae857a99)

## [0.3.0](https://github.com/atomist/skill/compare/0.2.3...0.3.0) - 2020-10-15

### Added

*   Remove single dispatch and add support for webhooks. [#82](https://github.com/atomist-skills/skill/issues/82)

### Changed

*   Consolidate skill categories. [#90](https://github.com/atomist-skills/skill/issues/90)

### Removed

*   **BREAKING** Remove support for single dispatch. [#77](https://github.com/atomist-skills/skill/issues/77)

## [0.2.3](https://github.com/atomist/skill/compare/0.2.2...0.2.3) - 2020-10-05

### Added

*   Add support for nodejs12 runtime. [a375d6f](https://github.com/atomist-skills/skill/commit/a375d6fc0b5f67b4f96f3a25a993fa40f8cd1edd)
*   Add lifecycle support to `Contextual`. [1c2d430](https://github.com/atomist-skills/skill/commit/1c2d43008ce9d877797c23bc7b6a72209b13b4f4)

## [0.2.2](https://github.com/atomist/skill/compare/0.2.1...0.2.2) - 2020-09-30

### Fixed

*   Check that stack fileName exists. [f6b9b34](https://github.com/atomist-skills/skill/commit/f6b9b34d1589eb36e14844630d4e3f918ca76660)

## [0.2.1](https://github.com/atomist/skill/compare/0.2.0...0.2.1) - 2020-09-30

### Fixed

*   Fixed graphql path lookup. [371a295](https://github.com/atomist-skills/skill/commit/371a295aa01b75320b393f54cec03c7d762d4f2b)

## [0.2.0](https://github.com/atomist/skill/compare/0.1.0...0.2.0) - 2020-09-26

### Added

*   Add cache support for store and restore file caches. [fc4c69c](https://github.com/atomist-skills/skill/commit/fc4c69c321fdfc4d54e5fa993636710edebf3ecd)
*   Export generated types for named triggers. [8ac07c7](https://github.com/atomist-skills/skill/commit/8ac07c77dbb4355bdde8114100c693ecff2156d2)
*   Allow individual commits with persistChanges. [dfa359c](https://github.com/atomist-skills/skill/commit/dfa359c5d848d291babf05a8408f3c15305bcd63)

### Changed

*   Remove undefined return value from steps. [9dc52c3](https://github.com/atomist-skills/skill/commit/9dc52c3b827d692672dfa04d4367d4776d431d01)
*   Consider increasing default runtime memory. [#67](https://github.com/atomist-skills/skill/issues/67)

### Fixed

*   Don't fail on non existing fragments. [dbcb33b](https://github.com/atomist-skills/skill/commit/dbcb33bf2d2cdfc3fb024b51184f881cfe1d3e10)

## [0.1.0](https://github.com/atomist/skill/tree/0.1.0)

### Added

*   Add options to set name and email on commit. [762d025](https://github.com/atomist/skill/commit/762d025ff6f301a0aea9e57377b1779efa018396)
*   Add signals, gates and gateSubscriptions. [5f26261](https://github.com/atomist/skill/commit/5f26261e889c905fce64c1e897dd2905b99663ac)
*   Add new invoke command. [1651e4e](https://github.com/atomist/skill/commit/1651e4e5c42dc784b077ce82d0b3fb3a43131a5a)
*   Add `index.ts` and re-structure code. [#14](https://github.com/atomist/skill/pull/14)
*   Add function to manage a GitHub check. [9ed9428](https://github.com/atomist/skill/commit/9ed942833d33c3c55ac276af4a727583fa40a5fc)
*   Add pushStrategy parameters helper. [42535da](https://github.com/atomist/skill/commit/42535da53a04b4260be82b67dea3605ced10c37d)
*   Add persistChanges helper. [1f8c8e2](https://github.com/atomist/skill/commit/1f8c8e219cd49b03be349ec8a77a8b190e9c199c)
*   Add closePullRequests helper. [882f8c1](https://github.com/atomist/skill/commit/882f8c173ffd73afaec13ad3846e7fa62c37d771)
*   Allow parameters to be passed into runSteps. [bcf1f83](https://github.com/atomist/skill/commit/bcf1f83e21bb7bd97880139af506f57222ca2404)
*   Add support for resources on docker artifacts. [d3e0eae](https://github.com/atomist/skill/commit/d3e0eae0426d7784d6b10a4f05767b8f04d6bcd2)
*   Add helper to select skill configuration for commands. [#16](https://github.com/atomist/skill/issues/16)
*   Add helper to create HandlerStatus instances. [00a6ecf](https://github.com/atomist-skills/skill/commit/00a6ecff4b07510d9452b6263898e3224c00e45b)
*   Rexport the slack-messages helpers. [c7bde59](https://github.com/atomist-skills/skill/commit/c7bde5975957b4f4d0a1e5413a98b8227a7d2983)
*   Add npmJSRegistry resource provider method. [984f406](https://github.com/atomist-skills/skill/commit/984f406b589876f3997be22b9d4b432d50ed9137)
*   GitHub Check output.summary can only have 65535 characters. [#29](https://github.com/atomist-skills/skill/issues/29)
*   Add matchesFilter helper for repository filtering. [522afd6](https://github.com/atomist-skills/skill/commit/522afd6442ea7d5c6210505d9ad18fed28beed3d)
*   Add state backed by storage bucket. [1d2cd72](https://github.com/atomist-skills/skill/commit/1d2cd724480409de71ee85e2024b540d4fc4c443)
*   Allow for explicit abort of steps. [3a79edf](https://github.com/atomist-skills/skill/commit/3a79edfba893a804a8d57267c1b9d5dfb931bf1c)

### Changed

*   Move to skill.ts from index.ts for skill definition. [#15](https://github.com/atomist/skill/issues/15)
*   Make users and channels optional in Destinations. [d0eb283](https://github.com/atomist/skill/commit/d0eb283b368c371f5dcc8198333dd377ccad8537)
*   Swap author and committer when user details are provided to git.commit. [1b556eb](https://github.com/atomist-skills/skill/commit/1b556eb3c1d673210c4e7e3aa2cfa7c45009e3da)

### Fixed

*   Fix filtering of repos when different org/repos are configured. [d111c6a](https://github.com/atomist-skills/skill/commit/d111c6a4fb9147a3b648e87af3ae1d27f0340b6f)
