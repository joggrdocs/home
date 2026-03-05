import { lauf, z } from 'laufen'

export default lauf({
  description: 'project script',
  args: {
    verbose: z.boolean().default(false).describe('Enable verbose logging'),
  },
  async run(ctx) {
    if (ctx.args.verbose) {
      ctx.logger.info(`Running project in ${ctx.packageDir}`)
    }

    // TODO: implement project
    ctx.logger.success('Hello from project!')
  },
})
