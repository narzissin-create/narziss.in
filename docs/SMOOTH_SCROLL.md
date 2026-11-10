# Storefront smooth scrolling

`SmoothScrollProvider.jsx` owns the storefront's single Lenis instance, its
animation frame, configuration, scroll-lock synchronization, and cleanup.
`App.jsx` contains only the provider import and mount.

- Wheel interpolation is `0.14`; touch interpolation is `0.12`. Lower values
  add smoothing, while higher values stop sooner.
- Setting `LENIS_ENABLED` to `false` disables Lenis without uninstalling it.
- Reduced-motion visitors always receive native scrolling.
- To remove Lenis completely, remove the provider import and mount from
  `App.jsx`, delete the provider, run `npm uninstall lenis`, and delete this
  document.
