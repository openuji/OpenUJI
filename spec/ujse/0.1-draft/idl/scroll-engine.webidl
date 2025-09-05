[Exposed=Window]
interface UJSE {
  attribute boolean enabled;
  void smoothScroll(DOMString selector, optional double duration = 250);
};