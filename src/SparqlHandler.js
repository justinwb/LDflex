/**
 * Expresses a path or mutation as a SPARQL query.
 *
 * Requires:
 * - a mutationExpressions or pathExpression property on the path proxy
 */
export default class SparqlHandler {
  async execute(path, proxy) {
    // First check if we have a mutation expression
    const mutationExpressions = await proxy.mutationExpressions;
    if (Array.isArray(mutationExpressions) && mutationExpressions.length)
      return this.evaluateMutationExpression(path, proxy, mutationExpressions);

    // Otherwise, fall back to checking for a path expression
    const pathExpression = await proxy.pathExpression;
    if (!Array.isArray(pathExpression))
      throw new Error(`${path} has no pathExpression property`);
    return this.evaluatePathExpression(path, proxy, pathExpression);
  }

  evaluatePathExpression(path, proxy, pathExpression) {
    // Require at least a subject and a link
    if (pathExpression.length < 2)
      throw new Error(`${path} should at least contain a subject and a predicate`);

    // Determine the query variable name
    const queryVar = path.property.match(/[a-z0-9]*$/i)[0] || 'result';

    // Build basic graph pattern
    const clauses = this.expressionToTriplePatterns(pathExpression, queryVar);

    // Embed the basic graph pattern into a SPARQL query
    const joinedClauses = clauses.join('\n  ');
    return `SELECT ?${queryVar} WHERE {\n  ${joinedClauses}\n}`;
  }

  evaluateMutationExpression(path, proxy, mutationExpressions) {
    return mutationExpressions
      .map(mutationExpression => this.mutationExpressionToQuery(mutationExpression))
      .join('\n;\n');
  }

  expressionToTriplePatterns([root, ...pathExpression], queryVar, variableScope = {}) {
    const last = pathExpression.length - 1;
    let object = `<${root.subject}>`;
    return pathExpression.map((segment, index) => {
      // Obtain triple pattern components
      const subject = object;
      const { predicate } = segment;
      object = index !== last ? `?${this.getQueryVar(`v${index}`, variableScope)}` : `?${queryVar}`;
      // Generate triple pattern
      return `${subject} <${predicate}> ${object}.`;
    });
  }

  mutationExpressionToQuery({ mutationType, domainExpression, predicate, rangeExpression }) {
    // Determine the patterns that should appear in the WHERE clause
    const variableScope = {};
    let clauses = [];
    let insertPattern;
    const { queryVar: domainQueryVar, clauses: domainClauses } = this.getQueryVarAndClauses(domainExpression, variableScope);
    if (domainClauses.length)
      clauses = domainClauses;
    if (rangeExpression) {
      const { queryVar: rangeQueryVar, clauses: rangeClauses } = this.getQueryVarAndClauses(rangeExpression, variableScope);
      if (rangeClauses.length) {
        if (clauses.length)
          clauses = clauses.concat(rangeClauses);
        else
          clauses = rangeClauses;
      }

      // If we have a range, the mutation is on <domainVar> <predicate> <rangeVar>
      insertPattern = `${domainQueryVar} <${predicate}> ${rangeQueryVar}`;
    }
    else {
      // If we don't have a range, assume that the mutation is on the last segment of the domain
      insertPattern = domainClauses[domainClauses.length - 1].slice(0, -1);
    }

    // If we don't have any WHERE clauses, we just insert raw data
    if (!clauses.length)
      return `${mutationType} DATA {\n  ${insertPattern}\n}`;

    // Otherwise, return an INSERT ... WHERE ... query
    return `${mutationType} {\n  ${insertPattern}\n} WHERE {\n  ${clauses.join('\n  ')}\n}`;
  }

  getQueryVarAndClauses(expression, variableScope) {
    const lastSegment = expression[expression.length - 1];

    if (expression.length === 1) {
      return {
        queryVar: lastSegment.subject[0] === '"' ?
          `"${lastSegment.subject.substr(1, lastSegment.subject.length - 2).replace(/"/g, '\\"')}"` :
          `<${lastSegment.subject}>`,
        clauses: [],
      };
    }

    const queryVar = this.getQueryVar(lastSegment.predicate.match(/[a-z0-9]*$/i)[0] || 'result', variableScope);
    return {
      queryVar: `?${queryVar}`,
      clauses: this.expressionToTriplePatterns(expression, queryVar, variableScope),
    };
  }

  // Creates a unique query variable label within the given scope based on the given suggestion
  getQueryVar(labelSuggestion, variableScope) {
    let label = labelSuggestion;
    let counter = 0;
    while (variableScope[label])
      label = `${labelSuggestion}_${counter++}`;
    variableScope[label] = true;
    return label;
  }
}
