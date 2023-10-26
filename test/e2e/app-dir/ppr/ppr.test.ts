import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'ppr',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next, isNextDev, isNextStart }) => {
    if (isNextStart) {
      it("should log a warning when `unstable_postpone` is called but there's no postpone state", async () => {
        // Three different pages wrap APIs that use `unstable_postpone` in a try catch to trigger these errors
        expect(next.cliOutput).toContain(
          '/suspense/node/cookies-error-no-throw opted out of partial prerendering because the postpone signal was intercepted by a try/catch in your application code.'
        )
        expect(next.cliOutput).toContain(
          '/suspense/node/fetch-error opted out of partial prerendering because the postpone signal was intercepted by a try/catch in your application code.'
        )
        expect(next.cliOutput).toContain(
          '/suspense/node/cookies-error opted out of partial prerendering because the postpone signal was intercepted by a try/catch in your application code.'
        )

        // fetch-error re-throws the error after catching it, so we want to make sure that's retained in the logs
        expect(next.cliOutput).toContain(
          'The following errors were re-thrown, and might help find the location of the try/catch that triggered this.'
        )
        expect(next.cliOutput).toContain('Error: You are not signed in')
      })
    }
    describe.each([
      { pathname: '/suspense/node' },
      { pathname: '/suspense/node/nested/1' },
      { pathname: '/suspense/node/nested/2' },
      { pathname: '/suspense/node/nested/3' },
      { pathname: '/loading/nested/1' },
      { pathname: '/loading/nested/2' },
      { pathname: '/loading/nested/3' },
    ])('for $pathname', ({ pathname }) => {
      // When we're partially pre-rendering, we should get the static parts
      // immediately, and the dynamic parts after the page loads. So we should
      // see the static part in the output, but the dynamic part should be
      // missing.
      it('should serve the static part', async () => {
        const $ = await next.render$(pathname)
        expect($('#page').length).toBe(1)
      })

      if (isNextDev) {
        it('should have the dynamic part', async () => {
          let $ = await next.render$(pathname)
          let dynamic = $('#container > #dynamic > #state')

          expect(dynamic.length).toBe(1)
          expect(dynamic.text()).toBe('Not Signed In')

          $ = await next.render$(
            pathname,
            {},
            {
              headers: {
                cookie: 'session=1',
              },
            }
          )
          dynamic = $('#container > #dynamic > #state')
          expect(dynamic.length).toBe(1)
          expect(dynamic.text()).toBe('Signed In')
        })
      } else {
        it('should not have the dynamic part', async () => {
          const $ = await next.render$(pathname)
          expect($('#container > #dynamic > #state').length).toBe(0)
        })
      }

      if (!isNextDev) {
        it('should cache the static part', async () => {
          // First, render the page to populate the cache.
          let res = await next.fetch(pathname)
          expect(res.status).toBe(200)
          expect(res.headers.get('x-nextjs-postponed')).toBe('1')

          // Then, render the page again.
          res = await next.fetch(pathname)
          expect(res.status).toBe(200)
          expect(res.headers.get('x-nextjs-cache')).toBe('HIT')
          expect(res.headers.get('x-nextjs-postponed')).toBe('1')
        })
      }
    })

    describe.each([
      { pathname: '/suspense/node' },
      { pathname: '/suspense/edge' },
    ])('with suspense for $pathname', ({ pathname }) => {
      // When the browser loads the page, we expect that the dynamic part will
      // be rendered.
      it('should eventually render the dynamic part', async () => {
        const browser = await next.browser(pathname)

        try {
          // Wait for the page part to load.
          await browser.waitForElementByCss('#page')
          await browser.waitForIdleNetwork()

          // Wait for the dynamic part to load.
          await browser.waitForElementByCss('#container > #dynamic > #state')

          // Ensure we've got the right dynamic part.
          let dynamic = await browser
            .elementByCss('#container > #dynamic > #state')
            .text()

          expect(dynamic).toBe('Not Signed In')

          // Re-visit the page with the cookie.
          await browser.addCookie({ name: 'session', value: '1' }).refresh()

          // Wait for the page part to load.
          await browser.waitForElementByCss('#page')
          await browser.waitForIdleNetwork()

          // Wait for the dynamic part to load.
          await browser.waitForElementByCss('#container > #dynamic > #state')

          // Ensure we've got the right dynamic part.
          dynamic = await browser
            .elementByCss('#container > #dynamic > #state')
            .text()

          expect(dynamic).toBe('Signed In')
        } finally {
          await browser.deleteCookies()
          await browser.close()
        }
      })
    })

    describe.each([{ pathname: '/no-suspense' }])(
      'without suspense for $pathname',
      ({ pathname }) => {
        // When the browser loads the page, we expect that the dynamic part will
        // be rendered.
        it('should immediately render the dynamic part', async () => {
          let $ = await next.render$(pathname)

          let dynamic = $('#container > #dynamic > #state').text()
          expect(dynamic).toBe('Not Signed In')

          // Re-visit the page with the cookie.
          $ = await next.render$(
            pathname,
            {},
            {
              headers: {
                cookie: 'session=1',
              },
            }
          )

          dynamic = $('#container > #dynamic > #state').text()
          expect(dynamic).toBe('Signed In')
        })
      }
    )
  }
)