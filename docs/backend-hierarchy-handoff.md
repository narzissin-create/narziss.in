# Storefront hierarchy backend handoff

The storefront no longer treats `/shop` as a broad catalogue. Real category
and subcategory pages remain unavailable until the backend supplies the
following saved data. The frontend intentionally shows an unavailable state
instead of manufacturing hierarchy records.

## Navigation response

Expose `GET /navigation` as either an array or `{ "sections": [...] }`.
Every record needs a stable `id`, display `name`, URL-safe `slug`, and
`sort_order`. Sections also need `clothing_type` (`upper` or `bottom`).
Categories must be nested under their section, with their subcategories nested
under the category:

```json
{
  "sections": [
    {
      "id": 1,
      "name": "Men Upper Wear",
      "slug": "men-upper-wear",
      "clothing_type": "upper",
      "sort_order": 0,
      "categories": [
        {
          "id": 10,
          "name": "Plain Shirts",
          "slug": "plain-shirts",
          "sort_order": 0,
          "subcategories": [
            {
              "id": 100,
              "name": "Example saved subcategory",
              "slug": "example-saved-subcategory",
              "sort_order": 0
            }
          ]
        }
      ]
    }
  ]
}
```

Only active records should be returned. Slugs must be unique within their
parent and remain stable so saved storefront URLs do not change unexpectedly.

## Product assignments

The existing product create/update flow needs to persist and return its
navigation assignments. Each product returned by `GET /products` needs:

- `navigation_category_id` for a direct category-leaf assignment;
- `navigation_subcategory_id` when assigned to a subcategory;
- its existing `tags` array, including the saved `trending` tag when relevant.

The IDs must refer to the records returned by `/navigation`. The backend should
validate that a subcategory belongs to the selected category and section.
Deleting or disabling hierarchy records needs an explicit product reassignment
policy rather than leaving silently orphaned products.

For the current small storefront the frontend can filter the returned product
array. Before catalogue growth, the preferred API is server-side filtering and
pagination using category/subcategory ID, tag, trending tag, price order,
offset, and limit, with an authoritative total count.

## Tags and Trending

`GET /admin/tags/public` is the source for the Tags dropdown. Trending is not
inferred: a product is trending only when its saved `tags` array contains the
admin-managed `trending` tag (case-insensitive). An empty matching set is valid
and should not be replaced with other products.

No backend or database changes were made as part of this frontend handoff.
