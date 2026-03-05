/**
 * Result type for query loading operations.
 */
export type QueryLoaderResult<T = string> = readonly [Error, null] | readonly [null, T]

/**
 * Loaded GraphQL queries.
 */
export interface Queries {
  readonly getProject: string
  readonly listProjectViews: string
  readonly updateFieldOptions: string
}

const GET_PROJECT_QUERY = `query GetProject($owner: String!, $number: Int!) {
  organization(login: $owner) {
    projectV2(number: $number) {
      id
      title
      shortDescription
      public
      readme
    }
  }
}`

const LIST_PROJECT_VIEWS_QUERY = `query ListProjectViews($owner: String!, $number: Int!) {
  organization(login: $owner) {
    projectV2(number: $number) {
      views(first: 50) {
        nodes {
          id
          name
          layout
          filter
          groupByFields(first: 10) {
            nodes {
              ... on ProjectV2Field { name }
              ... on ProjectV2SingleSelectField { name }
              ... on ProjectV2IterationField { name }
            }
          }
          sortByFields(first: 10) {
            nodes {
              field {
                ... on ProjectV2Field { name }
                ... on ProjectV2SingleSelectField { name }
                ... on ProjectV2IterationField { name }
              }
              direction
            }
          }
          visibleFields(first: 50) {
            nodes {
              name
            }
          }
        }
      }
    }
  }
}`

const UPDATE_FIELD_OPTIONS_MUTATION = `mutation UpdateFieldOptions($fieldId: ID!, $options: [ProjectV2SingleSelectFieldOptionInput!]!) {
  updateProjectV2Field(input: {
    fieldId: $fieldId
    singleSelectOptions: $options
  }) {
    projectV2Field {
      ... on ProjectV2SingleSelectField {
        id
        name
        options {
          id
          name
        }
      }
    }
  }
}`

/**
 * Loads all GraphQL queries as inlined constants.
 *
 * @returns All queries or an error if any query fails to load.
 */
export async function loadQueries(): Promise<QueryLoaderResult<Queries>> {
  return [
    null,
    {
      getProject: GET_PROJECT_QUERY,
      listProjectViews: LIST_PROJECT_VIEWS_QUERY,
      updateFieldOptions: UPDATE_FIELD_OPTIONS_MUTATION,
    },
  ]
}
